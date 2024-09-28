use crate::native_bridge;
use async_std::task::current;
use rayon::prelude::*;
use rayon::prelude::*;
use serde_json::Value;
use std::cmp::Ordering;
use std::collections::{HashMap,BTreeMap};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use rayon::iter::Either;

const CHUNK_SIZE: usize = 1024 * 1024; // 1MB

pub struct MemoryRegion {
    pub base_address: usize,
    pub size: usize,
    pub module: Option<String>,
}

#[derive(Debug, Clone)]
pub struct Module {
    pub base: usize,
    pub size: usize,
    pub is_64bit: bool,
    pub name: String,
}

#[derive(Debug, Clone)]
pub struct PointerScanResult {
    pub address: usize,
    pub offset: isize,
    pub module: Option<String>,
    pub next: Option<Box<PointerScanResult>>,
}

pub fn multi_level_pointer_scan(
    pid: i32,
    address_map: &BTreeMap<usize, Vec<usize>>,
    initial_targets: Vec<usize>,
    max_offset: usize,
    max_depth: usize,
) -> Result<Vec<PointerScanResult>, String> {
    let modules = load_modules(pid)?;

    let mut current_targets = initial_targets;
    let mut all_results = Vec::new();

    for depth in 0..max_depth {
        println!("Depth:{} Start!",depth);
        let start_time = Instant::now();
        let level_results = scan_level(
            address_map,
            &current_targets,
            max_offset,
            &modules,
        );

        if level_results.is_empty() {
            break;
        }

        if depth == 0 {
            all_results = level_results.clone();
        } else {
        }

        current_targets = level_results
            .iter()
            .map(|r| r.address)
            .collect::<Vec<usize>>();
        if current_targets.is_empty() {
            break;
        }
        let elapsed = start_time.elapsed();
        println!("ElapsedTime: {:?}", elapsed);
    }

    println!("{}", current_targets.len());
    Ok(all_results)
}


fn scan_level(
    address_map: &BTreeMap<usize, Vec<usize>>,
    targets: &[usize],
    max_offset: usize,
    modules: &[Module],
) -> Vec<PointerScanResult> {
    let mut results = Vec::new();

    for &target in targets {
        let lower_bound = target.saturating_sub(max_offset);
        let upper_bound = target;
    
        for (&key, addresses) in address_map.range(lower_bound..=upper_bound) {
            let offset = target as isize - key as isize;
            if offset.abs() as usize <= max_offset {
                for &address in addresses {
                    results.push(PointerScanResult {
                        address,
                        offset,
                        module: Some("".to_string()),
                        next: None,
                    });
                }
            }
        }
    }
    results
}

fn update_results(
    all_results: &mut Vec<PointerScanResult>,
    level_results: &[PointerScanResult],
    depth: usize,
) {
    if depth == 1 {
        for result in all_results.iter_mut() {
            let next_results: Vec<_> = level_results
                .iter()
                .filter(|r| r.address == result.address)
                .cloned()
                .collect();

            if !next_results.is_empty() {
                result.next = Some(Box::new(next_results[0].clone()));
            }
        }
    } else {
        for result in all_results.iter_mut() {
            if let Some(next) = &mut result.next {
                update_results_recursive(next, level_results, depth - 1);
            }
        }
    }
}

fn update_results_recursive(
    result: &mut PointerScanResult,
    level_results: &[PointerScanResult],
    remaining_depth: usize,
) {
    if remaining_depth == 1 {
        let next_results: Vec<_> = level_results
            .iter()
            .filter(|r| r.address == result.address)
            .cloned()
            .collect();

        if !next_results.is_empty() {
            result.next = Some(Box::new(next_results[0].clone()));
        }
    } else if let Some(next) = &mut result.next {
        update_results_recursive(next, level_results, remaining_depth - 1);
    }
}

fn find_module(address: usize, modules: &[Module]) -> Option<&Module> {
    modules
        .iter()
        .find(|m| address >= m.base && address < m.base + m.size)
}

fn filter_determined_pointers(results: Vec<PointerScanResult>) -> Vec<PointerScanResult> {
    results.into_iter().collect()
}

fn is_pointer_chain_valid(result: &PointerScanResult) -> bool {
    result.module.is_some()
        && result
            .next
            .as_ref()
            .map_or(true, |next| is_pointer_chain_valid(next))
}

fn load_modules(pid: i32) -> Result<Vec<Module>, String> {
    let modules_json = native_bridge::enum_modules(pid)?;
    modules_json
        .into_iter()
        .map(|module| {
            Ok(Module {
                base: module["base"].as_u64().ok_or("Invalid base address")? as usize,
                size: module["size"].as_u64().ok_or("Invalid size")? as usize,
                is_64bit: module["is_64bit"]
                    .as_bool()
                    .ok_or("Invalid is_64bit flag")?,
                name: module["modulename"]
                    .as_str()
                    .ok_or("Invalid module name")?
                    .to_string(),
            })
        })
        .collect()
}

pub fn create_address_map(pid: i32, memory_regions: &[MemoryRegion]) -> BTreeMap<usize, Vec<usize>> {

    let min_address = memory_regions
        .iter()
        .map(|r| r.base_address)
        .min()
        .unwrap_or(0);
    let max_address = memory_regions
        .iter()
        .map(|r| r.base_address + r.size)
        .max()
        .unwrap_or(0);

    let chunks: Vec<_> = memory_regions
        .iter()
        .flat_map(|region| {
            (region.base_address..region.base_address + region.size)
                .step_by(CHUNK_SIZE)
                .map(|start| {
                    let end = std::cmp::min(start + CHUNK_SIZE, region.base_address + region.size);
                    (start, end)
                })
        })
        .collect();

    let address_map = Arc::new(Mutex::new(BTreeMap::new()));

    chunks.par_iter().for_each(|&(start, end)| {
        let local_map = scan_memory_chunk(pid, start, end, min_address, max_address);
        let mut global_map = address_map.lock().unwrap();
        for (key, mut values) in local_map {
            global_map
                .entry(key)
                .or_insert_with(Vec::new)
                .append(&mut values);
        }
    });

    Arc::try_unwrap(address_map).unwrap().into_inner().unwrap()
}

fn scan_memory_chunk(
    pid: i32,
    start: usize,
    end: usize,
    min_address: usize,
    max_address: usize,
) -> BTreeMap<usize, Vec<usize>> {
    let mut local_map = BTreeMap::new();
    let chunk_size = end - start;
    let mut buffer = vec![0u8; chunk_size];

    match native_bridge::read_process_memory(
        pid,
        start as *mut libc::c_void,
        chunk_size,
        &mut buffer,
    ) {
        Ok(_) => {
            for i in (0..chunk_size).step_by(4) {
                if i + std::mem::size_of::<usize>() <= chunk_size {
                    let address = start + i;
                    let value = usize::from_ne_bytes(
                        buffer[i..i + std::mem::size_of::<usize>()]
                            .try_into()
                            .unwrap(),
                    );

                    if value >= min_address && value < max_address && value % 4 == 0 {
                        local_map
                            .entry(value)
                            .or_insert_with(Vec::new)
                            .push(address);
                    }
                }
            }
        }
        Err(e) => eprintln!("Error reading memory at address 0x{:x}: {}", start, e),
    }

    local_map
}

fn format_pointer_chain(result: &PointerScanResult) -> String {
    let mut offsets = Vec::new();
    let mut current = Some(result);
    let mut base_address = result.address;

    while let Some(pointer) = current {
        if pointer.module.is_some() {
            base_address = pointer.address;
            offsets.clear();
        } else {
            offsets.push(pointer.offset);
        }
        current = pointer.next.as_ref().map(|boxed| boxed.as_ref());
    }

    let mut formatted = format!("0x{:X}", base_address);
    for offset in offsets {
        formatted.push_str(&format!(" {:X}", offset));
    }
    formatted
}

pub fn print_formatted_results(results: &mut [PointerScanResult]) {
    results.sort_by_key(|result| result.address);
    for result in results {
        println!("{}", format_pointer_chain(result));
    }
}
