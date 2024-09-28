use rayon::prelude::*;
use serde_json::Value;
use std::cmp::Ordering;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::native_bridge;

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
    address_map: &HashMap<usize, Vec<usize>>,
    initial_targets: Vec<usize>,
    max_offset: usize,
    max_depth: usize,
) -> Result<Vec<PointerScanResult>, String> {
    let modules = load_modules(pid)?;
    let sorted_keys: Vec<usize> = {
        let mut k = address_map.keys().cloned().collect::<Vec<_>>();
        k.sort_unstable();
        k
    };

    let mut current_targets = initial_targets;
    let mut all_results = Vec::new();

    for depth in 0..max_depth {
        let level_results = scan_level(
            &sorted_keys,
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
            update_results(&mut all_results, &level_results, depth);
        }

        current_targets = level_results.iter().map(|r| r.address).collect();

        if current_targets.is_empty() {
            break;
        }
    }

    Ok(filter_determined_pointers(all_results))
}

fn scan_level(
    sorted_keys: &[usize],
    address_map: &HashMap<usize, Vec<usize>>,
    targets: &[usize],
    max_offset: usize,
    modules: &[Module],
) -> Vec<PointerScanResult> {
    let mut results = Vec::new();
    let mut sorted_targets = targets.to_vec();
    sorted_targets.sort_unstable();

    let mut key_index = 0;
    let mut target_index = 0;

    while key_index < sorted_keys.len() && target_index < sorted_targets.len() {
        let key = sorted_keys[key_index];
        let target = sorted_targets[target_index];

        match (key as isize - target as isize).abs() as usize {
            diff if diff <= max_offset => {
                if let Some(addresses) = address_map.get(&key) {
                    for &address in addresses {
                        let offset = key as isize - target as isize;
                        let module_name = find_module(address, modules).map(|m| m.name.clone());
                        results.push(PointerScanResult {
                            address,
                            offset,
                            module: module_name,
                            next: None,
                        });
                    }
                }
                key_index += 1;
            }
            diff if diff > max_offset && key > target => {
                target_index += 1;
            }
            _ => {
                key_index += 1;
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
    results
        .into_iter()
        .filter(|r| is_pointer_chain_valid(r))
        .collect()
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

pub fn create_address_map(pid: i32, memory_regions: &[MemoryRegion]) -> HashMap<usize, Vec<usize>> {
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

    let address_map = Arc::new(Mutex::new(HashMap::new()));

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
) -> HashMap<usize, Vec<usize>> {
    let mut local_map = HashMap::new();
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

                    if value >= min_address && value < max_address {
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
