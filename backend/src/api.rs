use byteorder::{ByteOrder, LittleEndian};
use hex;
use lazy_static::lazy_static;
use libc::{self, c_char, c_int, c_void};
use lz4_flex::block::compress_prepend_size;

use memchr::memmem;
use percent_encoding::percent_decode_str;
use rayon::prelude::*;
use regex::bytes::Regex;
use serde::Serialize;
use serde_json::json;
use serde_json::Value;
use std::collections::HashMap;

use log::{debug, error, info, trace, warn};

use std::collections::VecDeque;
use std::env;
use std::ffi::CStr;
use std::ffi::CString;
use std::fs::{self, File, OpenOptions};
use std::io::Read;
use std::io::Write;
use std::io::{BufRead, BufReader, BufWriter};
use std::mem::size_of;
use std::panic;
use std::path::{Path, PathBuf};
use std::process;
use std::slice;
use std::str;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::RwLock;
use std::sync::{Arc, Mutex};
use warp::hyper::Body;
use warp::{http::Response, http::StatusCode, Filter, Rejection, Reply};

use crate::native_bridge;
use crate::request;
use crate::util;

lazy_static! {
    static ref GLOBAL_POSITIONS: RwLock<HashMap<String, Vec<(usize, String)>>> =
        RwLock::new(HashMap::new());
    static ref GLOBAL_MEMORY: RwLock<HashMap<String, Vec<(usize, Vec<u8>, usize, Vec<u8>, usize, bool)>>> =
        RwLock::new(HashMap::new());
    static ref GLOBAL_SCAN_OPTION: RwLock<HashMap<String, request::MemoryScanRequest>> =
        RwLock::new(HashMap::new());
    static ref JSON_QUEUE: Arc<Mutex<VecDeque<String>>> = Arc::new(Mutex::new(VecDeque::new()));
    static ref GLOBAL_PROCESS_STATE: RwLock<bool> = RwLock::new(false);
}

#[no_mangle]
pub extern "C" fn native_log(level: c_int, message: *const c_char) {
    let log_message = unsafe { CStr::from_ptr(message).to_string_lossy().into_owned() };

    match level {
        0 => trace!("{}", log_message),
        1 => debug!("{}", log_message),
        2 => info!("{}", log_message),
        3 => warn!("{}", log_message),
        4 => error!("{}", log_message),
        _ => info!("{}", log_message),
    }
}

#[no_mangle]
pub extern "C" fn send_register_json(register_json: *const c_char, pid: i32) {
    let c_str = unsafe { CStr::from_ptr(register_json) };
    let rust_str = c_str.to_str().unwrap();

    let mut json_value: Value = serde_json::from_str(rust_str).unwrap();

    let pc_address_hex = json_value["pc"]
        .as_str()
        .ok_or("Failed to get 'pc' value")
        .unwrap();
    let pc_address = u64::from_str_radix(pc_address_hex.trim_start_matches("0x"), 16).unwrap();

    let mut buffer = [0u8; 4];
    native_bridge::read_process_memory(
        pid,
        pc_address as *mut libc::c_void,
        buffer.len(),
        &mut buffer as &mut [u8],
    )
    .unwrap();

    let disassembled = util::disassemble(buffer.as_ptr(), buffer.len(), pc_address);

    json_value["instruction"] = json!(disassembled);

    let mut queue = JSON_QUEUE.lock().unwrap();
    queue.push_back(json_value.to_string());
}

pub fn with_state(
    state: Arc<Mutex<Option<i32>>>,
) -> impl Filter<Extract = (Arc<Mutex<Option<i32>>>,), Error = std::convert::Infallible> + Clone {
    warp::any().map(move || state.clone())
}

const MAX_RESULTS: usize = 100_000;

pub async fn get_exception_info_handler() -> Result<impl warp::Reply, warp::Rejection> {
    let mut queue = JSON_QUEUE.lock().unwrap();
    let exceptions: Vec<Value> = queue
        .drain(..)
        .filter_map(|json_str| serde_json::from_str(&json_str).ok())
        .collect();

    Ok(warp::reply::json(&exceptions))
}

#[derive(Serialize)]
struct ServerInfo {
    git_hash: String,
    target_os: String,
    arch: String,
    pid: u32,
    mode: String,
}

pub async fn server_info_handler() -> Result<impl warp::Reply, warp::Rejection> {
    let git_hash = env!("GIT_HASH");
    let target_os = env!("TARGET_OS");

    let arch = if cfg!(target_arch = "x86_64") {
        "x86_64"
    } else if cfg!(target_arch = "aarch64") {
        "aarch64"
    } else if cfg!(target_arch = "arm") {
        "arm"
    } else if cfg!(target_arch = "x86") {
        "x86"
    } else {
        "unknown"
    };

    let pid = process::id();

    let server_info = ServerInfo {
        git_hash: git_hash.to_string(),
        target_os: target_os.to_string(),
        arch: arch.to_string(),
        pid: pid,
        mode: std::env::var("MEMORY_SERVER_RUNNING_MODE").unwrap_or_else(|_| "unknown".to_string()),
    };

    Ok(warp::reply::json(&server_info))
}

pub async fn open_process_handler(
    pid_state: Arc<Mutex<Option<i32>>>,
    open_process: request::OpenProcessRequest,
) -> Result<impl warp::Reply, warp::Rejection> {
    let mut pid = pid_state.lock().unwrap();
    *pid = Some(open_process.pid);
    Ok(warp::reply::with_status("OK", warp::http::StatusCode::OK))
}

pub async fn resolve_addr_handler(
    pid_state: Arc<Mutex<Option<i32>>>,
    resolve_addr: request::ResolveAddrRequest,
) -> Result<impl warp::Reply, warp::Rejection> {
    let pid = pid_state.lock().unwrap();

    if let Some(pid) = *pid {
        let modules = native_bridge::enum_modules(pid).unwrap();
        match util::resolve_symbolic_address(pid, &resolve_addr.query, &modules) {
            Ok(resolved_address) => {
                let result = json!({ "address": resolved_address });
                let result_string = result.to_string();
                let response = Response::builder()
                    .header("Content-Type", "application/json")
                    .body(hyper::Body::from(result_string))
                    .unwrap();
                Ok(response)
            }
            Err(e) => {
                let response = Response::builder()
                    .status(StatusCode::BAD_REQUEST)
                    .body(hyper::Body::from(format!(
                        "Failed to resolve address: {}",
                        e
                    )))
                    .unwrap();
                return Ok(response);
            }
        }
    } else {
        let response = Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .body(hyper::Body::from("Pid not set"))
            .unwrap();
        Ok(response)
    }
}

pub async fn read_memory_handler(
    pid_state: Arc<Mutex<Option<i32>>>,
    read_memory: request::ReadMemoryRequest,
) -> Result<impl warp::Reply, warp::Rejection> {
    let pid = pid_state.lock().unwrap();

    if let Some(pid) = *pid {
        let mut buffer: Vec<u8> = vec![0; read_memory.size];
        let nread = native_bridge::read_process_memory(
            pid,
            read_memory.address as *mut libc::c_void,
            read_memory.size,
            &mut buffer,
        );
        match nread {
            Ok(_) => {
                let response = Response::builder()
                    .header("Content-Type", "application/octet-stream")
                    .body(hyper::Body::from(buffer))
                    .unwrap();
                return Ok(response);
            }
            Err(_) => {
                let empty_buffer = Vec::new();
                let response = Response::builder()
                    .header("Content-Type", "application/octet-stream")
                    .body(hyper::Body::from(empty_buffer))
                    .unwrap();
                return Ok(response);
            }
        };
    } else {
        let response = Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .body(hyper::Body::from("Pid not set"))
            .unwrap();
        Ok(response)
    }
}

pub async fn read_memory_multiple_handler(
    pid_state: Arc<Mutex<Option<i32>>>,
    read_memory_requests: Vec<request::ReadMemoryRequest>,
) -> Result<impl warp::Reply, warp::Rejection> {
    let pid = pid_state.lock().unwrap();
    if let Some(pid) = *pid {
        let compressed_buffers: Vec<Vec<u8>> = read_memory_requests
            .par_iter()
            .map(|request| {
                let mut buffer: Vec<u8> = vec![0; request.size];
                let nread = native_bridge::read_process_memory(
                    pid,
                    request.address as *mut libc::c_void,
                    request.size,
                    &mut buffer,
                );
                match nread {
                    Ok(_) => {
                        let compressed_buffer = compress_prepend_size(&buffer);
                        let mut result_buffer = Vec::with_capacity(8 + compressed_buffer.len());
                        let compresed_buffer_size: u32 = compressed_buffer.len() as u32;
                        result_buffer.extend_from_slice(&1u32.to_le_bytes());
                        result_buffer.extend_from_slice(&compresed_buffer_size.to_le_bytes());
                        result_buffer.extend_from_slice(&compressed_buffer);
                        result_buffer
                    }
                    Err(_) => {
                        let mut result_buffer = Vec::with_capacity(4);
                        result_buffer.extend_from_slice(&0u32.to_le_bytes());
                        result_buffer
                    }
                }
            })
            .collect();

        let mut concatenated_buffer = Vec::new();
        for buffer in compressed_buffers {
            concatenated_buffer.extend(buffer);
        }

        let response = Response::builder()
            .header("Content-Type", "application/octet-stream")
            .body(hyper::Body::from(concatenated_buffer))
            .unwrap();
        Ok(response)
    } else {
        let response = Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .body(hyper::Body::from("Pid not set"))
            .unwrap();
        Ok(response)
    }
}

pub async fn write_memory_handler(
    pid_state: Arc<Mutex<Option<i32>>>,
    write_memory: request::WriteMemoryRequest,
) -> Result<impl warp::Reply, warp::Rejection> {
    let pid = pid_state.lock().unwrap();

    if let Some(pid) = *pid {
        let nwrite = native_bridge::write_process_memory(
            pid,
            write_memory.address as *mut libc::c_void,
            write_memory.buffer.len(),
            &write_memory.buffer,
        );
        match nwrite {
            Ok(_) => {
                let response = Response::builder()
                    .header("Content-Type", "text/plain")
                    .body(hyper::Body::from("Memory successfully written"))
                    .unwrap();
                return Ok(response);
            }
            Err(_) => {
                let response = Response::builder()
                    .status(StatusCode::BAD_REQUEST)
                    .body(hyper::Body::from("WriteProcessMemory error"))
                    .unwrap();
                return Ok(response);
            }
        };
    } else {
        let response = Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .body(hyper::Body::from("Pid not set"))
            .unwrap();
        Ok(response)
    }
}

pub async fn memory_scan_handler(
    pid_state: Arc<Mutex<Option<i32>>>,
    scan_request: request::MemoryScanRequest,
) -> Result<impl warp::Reply, warp::Rejection> {
    let pid = pid_state.lock().unwrap();

    let mut is_suspend_success: bool = false;
    let do_suspend = scan_request.do_suspend;
    if let Some(pid) = *pid {
        if do_suspend {
            unsafe {
                is_suspend_success = native_bridge::suspend_process(pid);
            }
        }
        // Clear global_positions for the given scan_id
        {
            let mut global_positions = GLOBAL_POSITIONS.write().unwrap();
            if let Some(positions) = global_positions.get_mut(&scan_request.scan_id) {
                positions.clear();
            }
            let mut global_memory = GLOBAL_MEMORY.write().unwrap();
            if let Some(memory) = global_memory.get_mut(&scan_request.scan_id) {
                memory.clear();
            } else {
            }
            let mut global_scan_option = GLOBAL_SCAN_OPTION.write().unwrap();
            global_scan_option.insert(scan_request.scan_id.clone(), scan_request.clone());
        }
        // memory-server-data-dir/Scan_xxx cleanup and create
        let mut scan_folder_path = PathBuf::from("");
        let mode =
            std::env::var("MEMORY_SERVER_RUNNING_MODE").unwrap_or_else(|_| "unknown".to_string());
        if mode == "embedded" {
            let cache_directory = util::get_cache_directory(pid);
            scan_folder_path = PathBuf::from(&cache_directory);
        }
        let sanitized_scan_id = scan_request.scan_id.trim().replace(" ", "_");
        scan_folder_path.push("memory-server-data-dir");
        scan_folder_path.push(&sanitized_scan_id);
        let scan_folder = Path::new(&scan_folder_path);

        if scan_folder.exists() {
            fs::remove_dir_all(&scan_folder).expect("Failed to remove directory");
        }
        fs::create_dir_all(&scan_folder_path).expect("Failed to create directory");

        let is_number = match scan_request.data_type.as_str() {
            "int16" | "uint16" | "int32" | "uint32" | "float" | "int64" | "uint64" | "double" => {
                true
            }
            _ => false,
        };
        let found_count = Arc::new(AtomicUsize::new(0));
        let scan_align = scan_request.align;
        let is_error_occurred = Arc::new(Mutex::new(false));
        let error_message = Arc::new(Mutex::new(String::new()));

        let thread_results: Vec<Vec<(usize, String)>> = scan_request
            .address_ranges
            .par_iter()
            .enumerate()
            .flat_map(|(index, &(ref start_address, ref end_address))| {
                let found_count = Arc::clone(&found_count);
                let size = end_address - start_address;
                let chunk_size = 1024 * 1024 * 16; // 16MB
                let num_chunks = (size + chunk_size - 1) / chunk_size;

                (0..num_chunks)
                    .map(|i| {
                        let mut error_occurred = is_error_occurred.lock().unwrap();
                        let mut error_msg = error_message.lock().unwrap();

                        if *error_occurred == true {
                            return vec![];
                        }
                        let chunk_start = start_address + i * chunk_size;
                        let chunk_end = std::cmp::min(chunk_start + chunk_size, *end_address);
                        let chunk_size_actual = chunk_end - chunk_start;
                        let mut buffer: Vec<u8> = vec![0; chunk_size_actual];

                        let mut local_positions = vec![];
                        let mut local_values = vec![];

                        let nread = match native_bridge::read_process_memory(
                            pid,
                            chunk_start as *mut libc::c_void,
                            chunk_size_actual,
                            &mut buffer,
                        ) {
                            Ok(nread) => nread,
                            Err(_) => -1,
                        };

                        if nread != -1 {
                            if scan_request.find_type == "exact" {
                                if scan_request.data_type == "regex" {
                                    let regex_pattern = &scan_request.pattern;
                                    let re = match Regex::new(regex_pattern) {
                                        Ok(re) => re,
                                        Err(_) => return vec![],
                                    };

                                    for cap in re.captures_iter(&buffer) {
                                        let start = cap.get(0).unwrap().start();
                                        if (chunk_start + start) % scan_align == 0 {
                                            let end = cap.get(0).unwrap().end();
                                            let value = hex::encode(&buffer[start..end]);
                                            local_positions.push(chunk_start + start);
                                            local_values.push(value);
                                            found_count.fetch_add(1, Ordering::SeqCst);
                                        }
                                    }
                                } else {
                                    let search_bytes = match hex::decode(&scan_request.pattern) {
                                        Ok(bytes) => bytes,
                                        Err(_) => return vec![],
                                    };

                                    let mut buffer_offset = 0;
                                    for pos in memmem::find_iter(&buffer, &search_bytes) {
                                        let start = chunk_start + buffer_offset + pos;
                                        if start % scan_align == 0 {
                                            let value = scan_request.pattern.clone();
                                            if is_number {
                                                local_positions.push(start);
                                                local_values.push(value);
                                            } else {
                                                local_positions.push(start);
                                                local_values.push(value);
                                            }
                                            found_count.fetch_add(1, Ordering::SeqCst);
                                        }
                                        buffer_offset += pos + 1;
                                    }
                                }
                            } else if scan_request.find_type == "unknown" {
                                let alignment = match scan_request.data_type.as_str() {
                                    "int16" | "uint16" => 2,
                                    "int32" | "uint32" | "float" => 4,
                                    "int64" | "uint64" | "double" => 8,
                                    _ => 1,
                                };

                                let mut file_path = scan_folder_path.clone();
                                file_path.push(format!("{}.dump", index));
                                let file_exists = file_path.exists();

                                let file = match OpenOptions::new()
                                    .create(true)
                                    .append(true)
                                    .open(file_path)
                                {
                                    Ok(file) => file,
                                    Err(e) => {
                                        *error_occurred = true;
                                        *error_msg = format!("Failed to open file: {}", e);
                                        return vec![];
                                    }
                                };

                                let mut writer = BufWriter::new(file);

                                if !file_exists {
                                    // status flag
                                    let zero_bytes = [0x00, 0x00, 0x00, 0x00];
                                    if let Err(e) = writer.write_all(&zero_bytes) {
                                        *error_occurred = true;
                                        *error_msg = format!("Failed to write 4 zero bytes: {}", e);
                                        return vec![];
                                    }
                                }

                                if let Err(e) = writer.write_all(&chunk_start.to_le_bytes()) {
                                    *error_occurred = true;
                                    *error_msg = format!("Failed to write chunk_start: {}", e);
                                    return vec![];
                                }

                                let compressed_buffer = lz4_flex::block::compress(&buffer);

                                if let Err(e) = writer
                                    .write_all(&(compressed_buffer.len() as u64).to_le_bytes())
                                {
                                    *error_occurred = true;
                                    *error_msg =
                                        format!("Failed to write compressed buffer length: {}", e);
                                    return vec![];
                                }

                                if let Err(e) =
                                    writer.write_all(&(buffer.len() as u64).to_le_bytes())
                                {
                                    *error_occurred = true;
                                    *error_msg = format!(
                                        "Failed to write uncompressed buffer length: {}",
                                        e
                                    );
                                    return vec![];
                                }

                                if let Err(e) = writer.write_all(&compressed_buffer) {
                                    *error_occurred = true;
                                    *error_msg = format!("Failed to write buffer data: {}", e);
                                    return vec![];
                                }

                                if let Err(e) = writer.flush() {
                                    *error_occurred = true;
                                    *error_msg = format!("Failed to flush buffer: {}", e);
                                    return vec![];
                                }
                                found_count.fetch_add(buffer.len() / alignment, Ordering::SeqCst);
                            }
                            // Check if local_positions exceed MAX_RESULTS and insert into global_positions
                            if local_positions.len() > MAX_RESULTS {
                                let mut global_positions = GLOBAL_POSITIONS.write().unwrap();
                                let combined: Vec<(usize, String)> = local_positions
                                    .into_iter()
                                    .zip(local_values.into_iter())
                                    .collect();
                                if let Some(positions) =
                                    global_positions.get_mut(&scan_request.scan_id)
                                {
                                    positions.extend(combined);
                                } else {
                                    global_positions.insert(scan_request.scan_id.clone(), combined);
                                }
                                local_positions = vec![];
                                local_values = vec![];
                            }
                        }

                        let combined: Vec<(usize, String)> = local_positions
                            .into_iter()
                            .zip(local_values.into_iter())
                            .collect();
                        combined
                    })
                    .collect::<Vec<_>>()
            })
            .collect();
        let mut do_play = GLOBAL_PROCESS_STATE.write().unwrap();
        if do_suspend && is_suspend_success && *do_play {
            unsafe {
                native_bridge::resume_process(pid);
            }
        }
        // println!("{}", found_count.load(Ordering::SeqCst));

        let flattened_results: Vec<(usize, String)> =
            thread_results.into_iter().flatten().collect();
        {
            let mut global_positions = GLOBAL_POSITIONS.write().unwrap();
            if let Some(positions) = global_positions.get_mut(&scan_request.scan_id) {
                positions.extend(flattened_results);
            } else {
                global_positions.insert(scan_request.scan_id.clone(), flattened_results);
            }
        }

        if scan_request.return_as_json {
            let global_positions = GLOBAL_POSITIONS.read().unwrap();
            if let Some(positions) = global_positions.get(&scan_request.scan_id) {
                let limited_positions = &positions[..std::cmp::min(MAX_RESULTS, positions.len())];
                let count = found_count.load(Ordering::SeqCst);
                let is_rounded: bool;
                if scan_request.find_type == "unknown" {
                    if count > 1_000_000 {
                        is_rounded = true;
                    } else {
                        is_rounded = limited_positions.len() != positions.len();
                    }
                } else {
                    is_rounded = limited_positions.len() != positions.len();
                }
                let matched_addresses: Vec<serde_json::Value> = limited_positions
                    .into_iter()
                    .map(|(address, value)| {
                        json!({
                            "address": address,
                            "value": value
                        })
                    })
                    .collect();
                let result = json!({
                    "matched_addresses": matched_addresses,
                    "found":count,
                    "is_rounded":is_rounded
                });
                let result_string = result.to_string();
                let response = Response::builder()
                    .header("Content-Type", "application/json")
                    .body(hyper::Body::from(result_string))
                    .unwrap();
                Ok(response)
            } else {
                let response = Response::builder()
                    .status(StatusCode::BAD_REQUEST)
                    .body(hyper::Body::from("Unknown error"))
                    .unwrap();
                Ok(response)
            }
        } else {
            let global_positions = GLOBAL_POSITIONS.read().unwrap();
            if let Some(_positions) = global_positions.get(&scan_request.scan_id) {
                let count = found_count.load(Ordering::SeqCst);
                let result_string = json!({ "found": count }).to_string();
                let response = Response::builder()
                    .header("Content-Type", "application/json")
                    .body(hyper::Body::from(result_string))
                    .unwrap();
                Ok(response)
            } else {
                let response = Response::builder()
                    .status(StatusCode::BAD_REQUEST)
                    .body(hyper::Body::from("Unknown error"))
                    .unwrap();
                Ok(response)
            }
        }
    } else {
        let response = Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .body(hyper::Body::from("Pid not set"))
            .unwrap();
        Ok(response)
    }
}

macro_rules! compare_values {
    ($val:expr, $old_val:expr, $filter_method:expr) => {
        match $filter_method {
            "changed" => $val != $old_val,
            "unchanged" => $val == $old_val,
            "increased" => $val > $old_val,
            "decreased" => $val < $old_val,
            _ => false,
        }
    };
}

pub async fn memory_filter_handler(
    pid_state: Arc<Mutex<Option<i32>>>,
    filter_request: request::MemoryFilterRequest,
) -> Result<impl warp::Reply, warp::Rejection> {
    let pid = pid_state.lock().unwrap();

    let mut is_suspend_success: bool = false;
    let do_suspend = filter_request.do_suspend;
    if let Some(pid) = *pid {
        let mut new_positions = Vec::new();
        let mut global_positions = GLOBAL_POSITIONS.write().unwrap();
        let mut global_memory = GLOBAL_MEMORY.write().unwrap();
        let global_scan_option = GLOBAL_SCAN_OPTION.write().unwrap();
        let scan_option: request::MemoryScanRequest = global_scan_option
            .get(&filter_request.scan_id)
            .unwrap()
            .clone();
        let found_count = Arc::new(AtomicUsize::new(0));
        let size = match filter_request.data_type.as_str() {
            "int16" | "uint16" => 2,
            "int32" | "uint32" | "float" => 4,
            "int64" | "uint64" | "double" => 8,
            _ => 1,
        };
        let is_error_occurred = Arc::new(Mutex::new(false));
        let error_message = Arc::new(Mutex::new(String::new()));

        let mut scan_folder_path = PathBuf::from("");
        let mode =
            std::env::var("MEMORY_SERVER_RUNNING_MODE").unwrap_or_else(|_| "unknown".to_string());
        if mode == "embedded" {
            let cache_directory = util::get_cache_directory(pid);
            scan_folder_path = PathBuf::from(&cache_directory);
        }
        let sanitized_scan_id = filter_request.scan_id.trim().replace(" ", "_");
        scan_folder_path.push("memory-server-data-dir");
        scan_folder_path.push(&sanitized_scan_id);

        // unknown search
        if scan_option.find_type == "unknown" {
            if do_suspend {
                unsafe {
                    is_suspend_success = native_bridge::suspend_process(pid);
                }
            }

            let paths = match fs::read_dir(&scan_folder_path) {
                Ok(entries) => entries
                    .filter_map(|entry| entry.ok().map(|e| e.path()))
                    .collect::<Vec<_>>(),
                Err(e) => {
                    let mut error_occurred = is_error_occurred.lock().unwrap();
                    let mut error_msg = error_message.lock().unwrap();
                    *error_occurred = true;
                    *error_msg = format!("Failed to read directory: {}", e);
                    vec![]
                }
            };

            let scan_align = scan_option.align;

            let mut exact_bytes: Vec<u8> = vec![];
            if filter_request.filter_method.as_str() == "exact" {
                exact_bytes = match hex::decode(&filter_request.pattern) {
                    Ok(bytes) => bytes,
                    Err(_) => vec![],
                };
            }

            if !*is_error_occurred.lock().unwrap() {
                paths.par_iter().for_each(|file_path| {
                    let mut error_occurred = is_error_occurred.lock().unwrap();
                    let mut error_msg = error_message.lock().unwrap();
                    if *error_occurred {
                        return;
                    }
                    let mut serialized_data: Vec<u8> = Vec::new();
                    if let Ok(file) = File::open(file_path) {
                        let mut reader = BufReader::new(file);
                        let mut data_buffer: Vec<u8> = Vec::new();
                        if let Err(e) = reader.read_to_end(&mut data_buffer) {
                            *error_occurred = true;
                            *error_msg = format!("Failed to read file: {}", e);
                            return;
                        }
                        let status_flag: [u8; 4] = match data_buffer[0..4].try_into() {
                            Ok(flag) => flag,
                            Err(e) => {
                                *error_occurred = true;
                                *error_msg = format!("Invalid address format: {}", e);
                                return;
                            }
                        };
                        let mut offset = 4;
                        let usize_size = size_of::<usize>();
                        if status_flag == [0x00, 0x00, 0x00, 0x00] {
                            while offset + 3 * usize_size <= data_buffer.len() {
                                let address = usize::from_le_bytes(
                                    data_buffer[offset..offset + usize_size]
                                        .try_into()
                                        .expect("Invalid address format"),
                                );

                                offset += usize_size;

                                let compressed_data_size = usize::from_le_bytes(
                                    data_buffer[offset..offset + usize_size]
                                        .try_into()
                                        .expect("Invalid length format"),
                                );
                                offset += usize_size;

                                let uncompressed_data_size = usize::from_le_bytes(
                                    data_buffer[offset..offset + usize_size]
                                        .try_into()
                                        .expect("Invalid length format"),
                                );
                                offset += usize_size;

                                if offset + compressed_data_size <= data_buffer.len() {
                                    let compressed_data =
                                        &data_buffer[offset..offset + compressed_data_size];
                                    offset += compressed_data_size;
                                    let decompressed_data = match lz4_flex::block::decompress(
                                        &compressed_data,
                                        uncompressed_data_size,
                                    ) {
                                        Ok(data) => data,
                                        Err(e) => {
                                            *error_occurred = true;
                                            *error_msg =
                                                format!("Failed to decompress data: {}", e);
                                            return;
                                        }
                                    };

                                    let mut buffer: Vec<u8> =
                                        vec![0; (decompressed_data.len()) as usize];
                                    let _nread = match native_bridge::read_process_memory(
                                        pid,
                                        address as *mut libc::c_void,
                                        decompressed_data.len(),
                                        &mut buffer,
                                    ) {
                                        Ok(nread) => nread,
                                        Err(_err) => -1,
                                    };

                                    if _nread == -1 {
                                        return;
                                    }
                                    for offset in (0..decompressed_data.len()).step_by(1) {
                                        if (address + offset) % scan_align != 0 {
                                            continue;
                                        }
                                        if offset + size > decompressed_data.len() {
                                            break;
                                        }
                                        let old_val = &decompressed_data[offset..offset + size];
                                        let new_val = &buffer[offset..offset + size];

                                        let mut pass_filter: bool = false;
                                        if filter_request.filter_method.as_str() == "exact" {
                                            if exact_bytes == new_val {
                                                pass_filter = true;
                                            }
                                        } else {
                                            pass_filter = match filter_request.data_type.as_str() {
                                                _ => compare_values!(
                                                    new_val,
                                                    old_val,
                                                    filter_request.filter_method.as_str()
                                                ),
                                            };
                                        }
                                        if pass_filter {
                                            serialized_data.extend_from_slice(
                                                &(address + offset).to_le_bytes(),
                                            );
                                            serialized_data.extend_from_slice(new_val);
                                            found_count.fetch_add(1, Ordering::SeqCst);
                                        }
                                    }
                                } else {
                                    break;
                                }
                            }
                        } else {
                            while offset + usize_size + size <= data_buffer.len() {
                                let address = match data_buffer.get(offset..offset + usize_size) {
                                    Some(slice) => usize::from_le_bytes(
                                        slice.try_into().expect("Invalid address format"),
                                    ),
                                    None => break,
                                };
                                offset += usize_size;

                                let old_val = &data_buffer[offset..offset + size];
                                offset += size;

                                let mut new_val_vec: Vec<u8> = vec![0; size];
                                let nread = match native_bridge::read_process_memory(
                                    pid,
                                    address as *mut libc::c_void,
                                    size,
                                    &mut new_val_vec,
                                ) {
                                    Ok(nread) => nread,
                                    Err(_) => {
                                        continue;
                                    }
                                };

                                if nread != size as isize {
                                    println!("Incomplete read at address {:x}", address);
                                    continue;
                                }
                                let new_val: &[u8] = &new_val_vec;

                                let mut pass_filter: bool = false;
                                if filter_request.filter_method.as_str() == "exact" {
                                    if exact_bytes == new_val {
                                        pass_filter = true;
                                    }
                                } else {
                                    pass_filter = match filter_request.data_type.as_str() {
                                        _ => compare_values!(
                                            new_val,
                                            old_val,
                                            filter_request.filter_method.as_str()
                                        ),
                                    };
                                }

                                if pass_filter {
                                    serialized_data.extend_from_slice(&address.to_le_bytes());
                                    serialized_data.extend_from_slice(&new_val);
                                    found_count.fetch_add(1, Ordering::SeqCst);
                                }
                            }
                        }
                    }

                    // rewrite file
                    let mut file = match OpenOptions::new()
                        .write(true)
                        .truncate(true)
                        .open(file_path)
                    {
                        Ok(file) => file,
                        Err(e) => {
                            *error_occurred = true;
                            *error_msg = format!("Failed to open file for writing: {}", e);
                            return;
                        }
                    };

                    let number: u32 = 0x00000001;
                    if let Err(e) = file.write_all(&number.to_le_bytes()) {
                        *error_occurred = true;
                        *error_msg = format!("Failed to write status flag: {}", e);
                        return;
                    }

                    if let Err(e) = file.write_all(&serialized_data) {
                        *error_occurred = true;
                        *error_msg = format!("Failed to write data: {}", e);
                        return;
                    }
                });
            }

            new_positions = if found_count.load(Ordering::SeqCst) < 1_000_000 {
                let mut results: Vec<(usize, String)> = paths
                    .par_iter()
                    .flat_map(|file_path| {
                        let mut file = match File::open(file_path) {
                            Ok(file) => file,
                            Err(e) => {
                                eprintln!("Failed to open file {:?}: {}", file_path, e);
                                return Vec::new();
                            }
                        };

                        let mut flag = [0u8; 4];
                        if let Err(e) = file.read_exact(&mut flag) {
                            eprintln!("Failed to read flag from {:?}: {}", file_path, e);
                            return Vec::new();
                        }

                        if u32::from_le_bytes(flag) != 0x00000001 {
                            return Vec::new();
                        }

                        let mut data = Vec::new();
                        if let Err(e) = file.read_to_end(&mut data) {
                            eprintln!("Failed to read data from {:?}: {}", file_path, e);
                            return Vec::new();
                        }

                        let mut local_results = Vec::new();
                        let mut offset = 0;
                        while offset + std::mem::size_of::<usize>() + size <= data.len() {
                            let address = usize::from_le_bytes(
                                data[offset..offset + std::mem::size_of::<usize>()]
                                    .try_into()
                                    .unwrap(),
                            );
                            offset += std::mem::size_of::<usize>();
                            let value = hex::encode(&data[offset..offset + size]);
                            offset += size;
                            local_results.push((address, value));
                        }

                        local_results
                    })
                    .collect();
                results
            } else {
                Vec::new()
            };
            new_positions.par_sort_unstable_by_key(|&(address, _)| address);
        } else if let Some(positions) = global_positions.get(&filter_request.scan_id) {
            if do_suspend {
                unsafe {
                    is_suspend_success = native_bridge::suspend_process(pid);
                }
            }
            let results: Result<Vec<_>, _> = positions
                .par_iter()
                .map(|(address, value)| {
                    let mut buffer: Vec<u8> = vec![0; (value.len() / 2) as usize];
                    let _nread = match native_bridge::read_process_memory(
                        pid,
                        *address as *mut libc::c_void,
                        filter_request.pattern.len(),
                        &mut buffer,
                    ) {
                        Ok(nread) => nread,
                        Err(_err) => -1,
                    };

                    if _nread == -1 {
                        return Ok(None);
                    }

                    if filter_request.data_type == "regex" {
                        let regex_pattern = &filter_request.pattern;
                        let re = match Regex::new(regex_pattern) {
                            Ok(re) => re,
                            Err(_) => return Ok(None),
                        };
                        if re.is_match(&buffer) {
                            found_count.fetch_add(1, Ordering::SeqCst);
                            return Ok(Some((*address, hex::encode(&buffer))));
                        }
                    } else {
                        if filter_request.filter_method == "exact" {
                            let result = hex::decode(&filter_request.pattern);
                            let bytes = match result {
                                Ok(bytes) => bytes,
                                Err(_) => {
                                    let response = Response::builder()
                                        .status(StatusCode::BAD_REQUEST)
                                        .body(hyper::Body::from("Invalid hex pattern"))
                                        .unwrap();
                                    return Err(response);
                                }
                            };
                            if buffer == bytes {
                                found_count.fetch_add(1, Ordering::SeqCst);
                                return Ok(Some((*address, hex::encode(&buffer))));
                            }
                        } else {
                            let result = hex::decode(&value);
                            let bytes = match result {
                                Ok(bytes) => bytes,
                                Err(_) => {
                                    let response = Response::builder()
                                        .status(StatusCode::BAD_REQUEST)
                                        .body(hyper::Body::from("Invalid hex pattern"))
                                        .unwrap();
                                    return Err(response);
                                }
                            };
                            let pass_filter: bool;

                            pass_filter = match filter_request.data_type.as_str() {
                                "int8" => {
                                    let old_val = i8::from_le_bytes(bytes.try_into().unwrap());
                                    let val = i8::from_le_bytes(buffer.clone().try_into().unwrap());
                                    compare_values!(
                                        val,
                                        old_val,
                                        filter_request.filter_method.as_str()
                                    )
                                }
                                "uint8" => {
                                    let old_val = u8::from_le_bytes(bytes.try_into().unwrap());
                                    let val = u8::from_le_bytes(buffer.clone().try_into().unwrap());
                                    compare_values!(
                                        val,
                                        old_val,
                                        filter_request.filter_method.as_str()
                                    )
                                }
                                "int16" => {
                                    let old_val = i16::from_le_bytes(bytes.try_into().unwrap());
                                    let val =
                                        i16::from_le_bytes(buffer.clone().try_into().unwrap());
                                    compare_values!(
                                        val,
                                        old_val,
                                        filter_request.filter_method.as_str()
                                    )
                                }
                                "uint16" => {
                                    let old_val = u16::from_le_bytes(bytes.try_into().unwrap());
                                    let val =
                                        u16::from_le_bytes(buffer.clone().try_into().unwrap());
                                    compare_values!(
                                        val,
                                        old_val,
                                        filter_request.filter_method.as_str()
                                    )
                                }
                                "int32" => {
                                    let old_val = i32::from_le_bytes(bytes.try_into().unwrap());
                                    let val =
                                        i32::from_le_bytes(buffer.clone().try_into().unwrap());
                                    compare_values!(
                                        val,
                                        old_val,
                                        filter_request.filter_method.as_str()
                                    )
                                }
                                "uint32" => {
                                    let old_val = u32::from_le_bytes(bytes.try_into().unwrap());
                                    let val =
                                        u32::from_le_bytes(buffer.clone().try_into().unwrap());
                                    compare_values!(
                                        val,
                                        old_val,
                                        filter_request.filter_method.as_str()
                                    )
                                }
                                "int64" => {
                                    let old_val = i64::from_le_bytes(bytes.try_into().unwrap());
                                    let val =
                                        i64::from_le_bytes(buffer.clone().try_into().unwrap());
                                    compare_values!(
                                        val,
                                        old_val,
                                        filter_request.filter_method.as_str()
                                    )
                                }
                                "uint64" => {
                                    let old_val = u64::from_le_bytes(bytes.try_into().unwrap());
                                    let val =
                                        u64::from_le_bytes(buffer.clone().try_into().unwrap());
                                    compare_values!(
                                        val,
                                        old_val,
                                        filter_request.filter_method.as_str()
                                    )
                                }
                                "float" => {
                                    let old_val = LittleEndian::read_f32(&bytes);
                                    let val = LittleEndian::read_f32(&buffer.clone());
                                    compare_values!(
                                        val,
                                        old_val,
                                        filter_request.filter_method.as_str()
                                    )
                                }
                                "double" => {
                                    let old_val = LittleEndian::read_f64(&bytes);
                                    let val = LittleEndian::read_f64(&buffer.clone());
                                    compare_values!(
                                        val,
                                        old_val,
                                        filter_request.filter_method.as_str()
                                    )
                                }
                                "utf-8" => {
                                    let old_val = str::from_utf8(&bytes).unwrap_or("");
                                    let val = str::from_utf8(&buffer).unwrap_or("");
                                    match filter_request.filter_method.as_str() {
                                        "changed" => val != old_val,
                                        "unchanged" => val == old_val,
                                        _ => false,
                                    }
                                }
                                "utf-16" => {
                                    let buffer_u16: Vec<u16> = buffer
                                        .clone()
                                        .chunks_exact(2)
                                        .map(|b| u16::from_ne_bytes([b[0], b[1]]))
                                        .collect();
                                    match filter_request.filter_method.as_str() {
                                        "changed" => {
                                            let old_value: Vec<u16> = hex::decode(&value)
                                                .unwrap()
                                                .chunks_exact(2)
                                                .map(|b| u16::from_ne_bytes([b[0], b[1]]))
                                                .collect();
                                            buffer_u16 != old_value
                                        }
                                        "unchanged" => {
                                            let old_value: Vec<u16> = hex::decode(&value)
                                                .unwrap()
                                                .chunks_exact(2)
                                                .map(|b| u16::from_ne_bytes([b[0], b[1]]))
                                                .collect();
                                            buffer_u16 == old_value
                                        }
                                        _ => false,
                                    }
                                }
                                "aob" => match filter_request.filter_method.as_str() {
                                    "changed" => buffer != bytes,
                                    "unchanged" => buffer == bytes,
                                    _ => false,
                                },
                                _ => false,
                            };

                            if pass_filter {
                                found_count.fetch_add(1, Ordering::SeqCst);
                                return Ok(Some((*address, hex::encode(&buffer))));
                            }
                        }
                    }
                    Ok(None)
                })
                .collect();

            match results {
                Ok(results) => {
                    new_positions = results.into_iter().filter_map(|x| x).collect();
                }
                Err(response) => {
                    let mut do_play = GLOBAL_PROCESS_STATE.write().unwrap();
                    if do_suspend && is_suspend_success && *do_play {
                        unsafe {
                            native_bridge::resume_process(pid);
                        }
                    }
                    return Ok(response);
                }
            }
        } else {
            let response = Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .body(Body::from("Scanid not found"))
                .unwrap();
            return Ok(response);
        }
        let mut do_play = GLOBAL_PROCESS_STATE.write().unwrap();
        if do_suspend && is_suspend_success && *do_play {
            unsafe {
                native_bridge::resume_process(pid);
            }
        }
        global_positions.insert(filter_request.scan_id.clone(), new_positions.clone());

        if filter_request.return_as_json {
            let limited_positions =
                &new_positions[..std::cmp::min(MAX_RESULTS, new_positions.len())];
            let is_rounded: bool;
            let count = found_count.load(Ordering::SeqCst);
            if scan_option.find_type == "unknown" {
                if count > 1_000_000 {
                    is_rounded = true;
                } else {
                    is_rounded = limited_positions.len() != new_positions.len();
                }
            } else {
                is_rounded = limited_positions.len() != new_positions.len();
            }
            let matched_addresses: Vec<serde_json::Value> = limited_positions
                .iter()
                .map(|(address, value)| {
                    json!({
                        "address": address,
                        "value": value
                    })
                })
                .collect();

            let result = json!({
                "matched_addresses": matched_addresses,
                "found":count,
                "is_rounded":is_rounded

            });
            let result_string = result.to_string();
            let response = Response::builder()
                .header("Content-Type", "application/json")
                .body(Body::from(result_string))
                .unwrap();
            Ok(response)
        } else {
            let count = found_count.load(Ordering::SeqCst);
            let result_string = json!({ "found": count }).to_string();
            let response = Response::builder()
                .header("Content-Type", "application/json")
                .body(hyper::Body::from(result_string))
                .unwrap();
            Ok(response)
        }
    } else {
        let response = Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .body(Body::from("Pid not set"))
            .unwrap();
        Ok(response)
    }
}

#[derive(Serialize)]
struct Region {
    start_address: String,
    end_address: String,
    protection: String,
    file_path: Option<String>,
}

pub async fn enumerate_regions_handler(
    pid_state: Arc<Mutex<Option<i32>>>,
) -> Result<impl warp::Reply, warp::Rejection> {
    let pid = pid_state.lock().unwrap();

    if let Some(pid) = *pid {
        let mut buffer = vec![0u8; 1024 * 1024];

        unsafe {
            native_bridge::enumerate_regions_to_buffer(pid, buffer.as_mut_ptr(), buffer.len());
        }
        let buffer_cstring = unsafe { CString::from_vec_unchecked(buffer) };
        let buffer_string = buffer_cstring.into_string().unwrap();
        let buffer_reader = BufReader::new(buffer_string.as_bytes());

        let mut regions = Vec::new();

        for line in buffer_reader.lines() {
            if let Ok(line) = line {
                let parts: Vec<&str> = line.split_whitespace().collect();

                if parts.len() >= 5 {
                    let addresses: Vec<&str> = parts[0].split('-').collect();
                    if addresses.len() == 2 {
                        let region = Region {
                            start_address: addresses[0].to_string(),
                            end_address: addresses[1].to_string(),
                            protection: parts[1].to_string(),
                            file_path: if parts.len() > 5 {
                                Some(parts[5..].join(" "))
                            } else {
                                None
                            },
                        };
                        regions.push(region);
                    }
                }
            }
        }

        let result = json!({ "regions": regions });
        let result_string = result.to_string();
        let response = Response::builder()
            .header("Content-Type", "application/json")
            .body(hyper::Body::from(result_string))
            .unwrap();
        Ok(response)
    } else {
        let response = Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .body(hyper::Body::from("Pid not set"))
            .unwrap();
        Ok(response)
    }
}

pub async fn enumerate_process_handler() -> Result<impl Reply, Rejection> {
    let mut count: usize = 0;
    let process_info_ptr = unsafe { native_bridge::enumprocess_native(&mut count) };
    let process_info_slice = unsafe { std::slice::from_raw_parts(process_info_ptr, count) };

    let mut json_array = Vec::new();
    for i in 0..count {
        let process_name = unsafe {
            CStr::from_ptr(process_info_slice[i].processname)
                .to_string_lossy()
                .into_owned()
        };
        json_array.push(json!({
            "pid": process_info_slice[i].pid,
            "processname": process_name
        }));
        unsafe { libc::free(process_info_slice[i].processname as *mut libc::c_void) };
    }

    // for cdylib
    if count == 0 {
        let pid = unsafe { native_bridge::get_pid_native() };
        json_array.push(json!({
            "pid": pid,
            "processname": "self".to_string()
        }));
    } else {
        unsafe {
            libc::free(process_info_ptr as *mut libc::c_void);
        }
    }

    let json_response = warp::reply::json(&json_array);
    Ok(json_response)
}

pub async fn enummodule_handler(
    pid_state: Arc<Mutex<Option<i32>>>,
) -> Result<impl warp::Reply, warp::Rejection> {
    let pid = pid_state.lock().unwrap();
    if let Some(pid) = *pid {
        let modules = native_bridge::enum_modules(pid).unwrap();
        let result = json!({ "modules": modules });
        let result_string = result.to_string();
        let response = Response::builder()
            .header("Content-Type", "application/json")
            .body(hyper::Body::from(result_string))
            .unwrap();
        Ok(response)
    } else {
        let response = Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .body(hyper::Body::from("Pid not set"))
            .unwrap();
        Ok(response)
    }
}

pub async fn explore_directory_handler(
    req: request::ExploreDirectoryRequest,
) -> Result<impl Reply, Rejection> {
    let decoded_path = percent_decode_str(&req.path)
        .decode_utf8_lossy()
        .into_owned();

    let c_path = match CString::new(decoded_path.clone()) {
        Ok(path) => path,
        Err(_) => {
            return Ok(warp::reply::with_status(
                warp::reply::json(&json!({
                    "error": "Invalid path: contains null byte",
                    "path": decoded_path,
                    "max_depth": req.max_depth
                })),
                warp::http::StatusCode::BAD_REQUEST,
            ))
        }
    };

    let result = panic::catch_unwind(|| unsafe {
        let result_ptr = native_bridge::explore_directory(c_path.as_ptr(), req.max_depth as c_int);
        if result_ptr.is_null() {
            return Err("Null pointer returned from explore_directory");
        }
        let result_str = CStr::from_ptr(result_ptr).to_string_lossy().into_owned();
        libc::free(result_ptr as *mut libc::c_void);
        Ok(result_str)
    });

    let result = match result {
        Ok(Ok(result)) => result,
        Ok(Err(err)) => {
            return Ok(warp::reply::with_status(
                warp::reply::json(&json!({
                    "error": err,
                    "path": decoded_path,
                    "max_depth": req.max_depth
                })),
                warp::http::StatusCode::INTERNAL_SERVER_ERROR,
            ))
        }
        Err(_) => {
            return Ok(warp::reply::with_status(
                warp::reply::json(&json!({
                    "error": "Process panicked during directory exploration",
                    "path": decoded_path,
                    "max_depth": req.max_depth
                })),
                warp::http::StatusCode::INTERNAL_SERVER_ERROR,
            ))
        }
    };

    if result.starts_with("Error:") {
        return Ok(warp::reply::with_status(
            warp::reply::json(&json!({
                "error": result,
                "path": decoded_path,
                "max_depth": req.max_depth
            })),
            warp::http::StatusCode::BAD_REQUEST,
        ));
    }

    match panic::catch_unwind(|| util::parse_directory_structure(&result)) {
        Ok(items) => Ok(warp::reply::with_status(
            warp::reply::json(&items),
            warp::http::StatusCode::OK,
        )),
        Err(_) => Ok(warp::reply::with_status(
            warp::reply::json(&json!({
                "error": "Process panicked during parsing of directory structure",
                "path": decoded_path,
                "max_depth": req.max_depth
            })),
            warp::http::StatusCode::INTERNAL_SERVER_ERROR,
        )),
    }
}

pub async fn read_file_handler(req: request::ReadFileRequest) -> Result<Response<Body>, Rejection> {
    let decoded_path = percent_decode_str(&req.path)
        .decode_utf8_lossy()
        .into_owned();

    let c_path = CString::new(decoded_path.clone()).unwrap();
    let mut size: usize = 0;
    let mut error_ptr: *mut c_char = std::ptr::null_mut();

    let data_ptr = unsafe {
        native_bridge::read_file(
            c_path.as_ptr(),
            &mut size as *mut usize,
            &mut error_ptr as *mut *mut c_char,
        )
    };

    if !error_ptr.is_null() {
        let error_message = unsafe { CStr::from_ptr(error_ptr).to_string_lossy().into_owned() };
        unsafe { libc::free(error_ptr as *mut c_void) };
        return Ok(Response::builder()
            .status(StatusCode::INTERNAL_SERVER_ERROR)
            .body(Body::from(error_message))
            .unwrap());
    }

    if data_ptr.is_null() || size == 0 {
        return Ok(Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Body::from("File not found or empty"))
            .unwrap());
    }

    let data = unsafe { slice::from_raw_parts(data_ptr as *const u8, size) }.to_vec();
    unsafe { libc::free(data_ptr as *mut c_void) };

    Ok(Response::builder()
        .header("Content-Type", "application/octet-stream")
        .body(Body::from(data))
        .unwrap())
}

pub async fn get_app_info_handler(
    pid_state: Arc<Mutex<Option<i32>>>,
) -> Result<impl warp::Reply, warp::Rejection> {
    let pid = pid_state.lock().unwrap();
    if let Some(pid) = *pid {
        let result = native_bridge::get_application_info(pid);
        let message = match result {
            Ok(message) => message,
            Err(e) => {
                return Ok(warp::reply::with_status(
                    warp::reply::json(&serde_json::json!({
                        "message": e.to_string()
                    })),
                    StatusCode::INTERNAL_SERVER_ERROR,
                ));
            }
        };
        let parsed_result: Value = match serde_json::from_str(&message) {
            Ok(json) => json,
            Err(e) => {
                return Ok(warp::reply::with_status(
                    warp::reply::json(&serde_json::json!({
                        "message": format!("Failed to parse application info: {}", e)
                    })),
                    StatusCode::INTERNAL_SERVER_ERROR,
                ));
            }
        };
        Ok(warp::reply::with_status(
            warp::reply::json(&json!({ "info": parsed_result })),
            StatusCode::OK,
        ))
    } else {
        Ok(warp::reply::with_status(
            warp::reply::json(&json!({"error": "Pid not set"})),
            StatusCode::BAD_REQUEST,
        ))
    }
}

pub async fn set_watchpoint_handler(
    pid_state: Arc<Mutex<Option<i32>>>,
    watchpoint: request::SetWatchPointRequest,
) -> Result<impl warp::Reply, warp::Rejection> {
    let pid = pid_state.lock().unwrap();

    if let Some(pid) = *pid {
        let _type = match watchpoint._type.as_str() {
            "r" => 1,
            "w" => 2,
            "a" => 3,
            _ => {
                return Ok(warp::reply::with_status(
                    warp::reply::json(&request::SetWatchPointResponse {
                        success: false,
                        message: format!("Unknown type"),
                    }),
                    StatusCode::BAD_REQUEST,
                ))
            }
        };
        let result = native_bridge::set_watchpoint(pid, watchpoint.address, watchpoint.size, _type);

        let ret = match result {
            Ok(_) => Ok(warp::reply::with_status(
                warp::reply::json(&request::SetWatchPointResponse {
                    success: true,
                    message: "Watchpoint set successfully".to_string(),
                }),
                StatusCode::OK,
            )),
            Err(e) => Ok(warp::reply::with_status(
                warp::reply::json(&request::SetWatchPointResponse {
                    success: false,
                    message: format!("Failed to set watchpoint. Error: {}", e),
                }),
                StatusCode::INTERNAL_SERVER_ERROR,
            )),
        };
        return ret;
    } else {
        Ok(warp::reply::with_status(
            warp::reply::json(&request::SetWatchPointResponse {
                success: false,
                message: format!("Pid not set"),
            }),
            StatusCode::BAD_REQUEST,
        ))
    }
}

pub async fn remove_watchpoint_handler(
    pid_state: Arc<Mutex<Option<i32>>>,
    watchpoint: request::RemoveWatchPointRequest,
) -> Result<impl warp::Reply, warp::Rejection> {
    let pid = pid_state.lock().unwrap();

    if let Some(_pid) = *pid {
        let result = native_bridge::remove_watchpoint(watchpoint.address);

        let ret = match result {
            Ok(_) => Ok(warp::reply::with_status(
                warp::reply::json(&request::RemoveWatchPointResponse {
                    success: true,
                    message: "Remove Watchpoint set successfully".to_string(),
                }),
                StatusCode::OK,
            )),
            Err(e) => Ok(warp::reply::with_status(
                warp::reply::json(&request::RemoveWatchPointResponse {
                    success: false,
                    message: format!("Failed to remove watchpoint. Error: {}", e),
                }),
                StatusCode::INTERNAL_SERVER_ERROR,
            )),
        };
        return ret;
    } else {
        Ok(warp::reply::with_status(
            warp::reply::json(&request::RemoveWatchPointResponse {
                success: false,
                message: format!("Pid not set"),
            }),
            StatusCode::BAD_REQUEST,
        ))
    }
}

pub async fn set_breakpoint_handler(
    pid_state: Arc<Mutex<Option<i32>>>,
    breakpoint: request::SetBreakPointRequest,
) -> Result<impl warp::Reply, warp::Rejection> {
    let pid = pid_state.lock().unwrap();
    if let Some(pid) = *pid {
        let result = native_bridge::set_breakpoint(pid, breakpoint.address, breakpoint.hit_count);
        let ret = match result {
            Ok(_) => Ok(warp::reply::with_status(
                warp::reply::json(&request::SetBreakPointResponse {
                    success: true,
                    message: "Breakpoint set successfully".to_string(),
                }),
                StatusCode::OK,
            )),
            Err(e) => Ok(warp::reply::with_status(
                warp::reply::json(&request::SetBreakPointResponse {
                    success: false,
                    message: format!("Failed to set breakpoint. Error: {}", e),
                }),
                StatusCode::INTERNAL_SERVER_ERROR,
            )),
        };
        return ret;
    } else {
        Ok(warp::reply::with_status(
            warp::reply::json(&request::SetBreakPointResponse {
                success: false,
                message: format!("Pid not set"),
            }),
            StatusCode::BAD_REQUEST,
        ))
    }
}

pub async fn remove_breakpoint_handler(
    pid_state: Arc<Mutex<Option<i32>>>,
    breakpoint: request::RemoveBreakPointRequest,
) -> Result<impl warp::Reply, warp::Rejection> {
    let pid = pid_state.lock().unwrap();
    if let Some(_pid) = *pid {
        let result = native_bridge::remove_breakpoint(breakpoint.address);
        let ret = match result {
            Ok(_) => Ok(warp::reply::with_status(
                warp::reply::json(&request::RemoveBreakPointResponse {
                    success: true,
                    message: "Breakpoint removed successfully".to_string(),
                }),
                StatusCode::OK,
            )),
            Err(e) => Ok(warp::reply::with_status(
                warp::reply::json(&request::RemoveBreakPointResponse {
                    success: false,
                    message: format!("Failed to remove breakpoint. Error: {}", e),
                }),
                StatusCode::INTERNAL_SERVER_ERROR,
            )),
        };
        return ret;
    } else {
        Ok(warp::reply::with_status(
            warp::reply::json(&request::RemoveBreakPointResponse {
                success: false,
                message: format!("Pid not set"),
            }),
            StatusCode::BAD_REQUEST,
        ))
    }
}

pub async fn change_process_state_handler(
    pid_state: Arc<Mutex<Option<i32>>>,
    state_request: request::ChangeProcessStateRequest,
) -> Result<impl warp::Reply, warp::Rejection> {
    let pid = pid_state.lock().unwrap();

    if let Some(_pid) = *pid {
        let result = if state_request.do_play {
            unsafe { native_bridge::resume_process(_pid) }
        } else {
            unsafe { native_bridge::suspend_process(_pid) }
        };

        let ret = match result {
            true => Ok(warp::reply::with_status(
                warp::reply::json(&request::ChangeProcessStateResponse {
                    success: true,
                    message: format!(
                        "Process {} successfully",
                        if state_request.do_play {
                            "resumed"
                        } else {
                            "suspend"
                        }
                    ),
                }),
                StatusCode::OK,
            )),
            false => Ok(warp::reply::with_status(
                warp::reply::json(&request::ChangeProcessStateResponse {
                    success: false,
                    message: format!("Failed to change process state. Error"),
                }),
                StatusCode::INTERNAL_SERVER_ERROR,
            )),
        };
        return ret;
    } else {
        Ok(warp::reply::with_status(
            warp::reply::json(&request::ChangeProcessStateResponse {
                success: false,
                message: "Pid not set".to_string(),
            }),
            StatusCode::BAD_REQUEST,
        ))
    }
}
