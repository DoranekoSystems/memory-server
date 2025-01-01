use libc::{self, c_char, c_int, c_void};
use serde_json::json;
use std::ffi::{CStr, CString};
use std::io::{BufRead, BufReader, Error};

#[cfg_attr(target_os = "android", link(name = "c++_static", kind = "static"))]
#[cfg_attr(target_os = "android", link(name = "c++abi", kind = "static"))]
#[link(name = "native", kind = "static")]
extern "C" {
    pub fn get_pid_native() -> i32;
    pub fn enumprocess_native(count: *mut usize) -> *mut ProcessInfo;
    pub fn enummodule_native(pid: i32, count: *mut usize) -> *mut ModuleInfo;
    pub fn enumerate_regions_to_buffer(pid: i32, buffer: *mut u8, buffer_size: usize);
    pub fn read_memory_native(
        pid: libc::c_int,
        address: libc::uintptr_t,
        size: libc::size_t,
        buffer: *mut u8,
    ) -> libc::ssize_t;
    pub fn write_memory_native(
        pid: i32,
        address: libc::uintptr_t,
        size: libc::size_t,
        buffer: *const u8,
    ) -> libc::ssize_t;
    pub fn suspend_process(pid: i32) -> bool;
    pub fn resume_process(pid: i32) -> bool;
    pub fn native_init(mode: i32) -> libc::c_int;
    pub fn explore_directory(path: *const c_char, max_depth: i32) -> *mut libc::c_char;
    pub fn read_file(
        path: *const c_char,
        size: *mut usize,
        error_message: *mut *mut c_char,
    ) -> *const c_void;
    pub fn get_application_info_native(pid: c_int) -> *const c_char;
    pub fn debugger_new(pid: c_int) -> bool;
    pub fn set_watchpoint_native(
        address: libc::uintptr_t,
        size: libc::size_t,
        _type: libc::c_int,
    ) -> libc::c_int;
    pub fn remove_watchpoint_native(address: libc::uintptr_t) -> libc::c_int;
    pub fn set_breakpoint_native(address: usize, hit_count: i32) -> i32;
    pub fn remove_breakpoint_native(address: usize) -> i32;
}

#[repr(C)]
pub struct ProcessInfo {
    pub pid: i32,
    pub processname: *mut c_char,
}

#[repr(C)]
pub struct ModuleInfo {
    pub base: usize,
    pub size: i32,
    pub is_64bit: bool,
    pub modulename: *mut c_char,
}

pub fn read_process_memory(
    pid: i32,
    address: *mut libc::c_void,
    size: usize,
    buffer: &mut [u8],
) -> Result<isize, Error> {
    let result =
        unsafe { read_memory_native(pid, address as libc::uintptr_t, size, buffer.as_mut_ptr()) };
    if result >= 0 {
        Ok(result as isize)
    } else {
        Err(Error::last_os_error())
    }
}

pub fn write_process_memory(
    pid: i32,
    address: *mut libc::c_void,
    size: usize,
    buffer: &[u8],
) -> Result<isize, Error> {
    let result =
        unsafe { write_memory_native(pid, address as libc::uintptr_t, size, buffer.as_ptr()) };
    if result >= 0 {
        Ok(result as isize)
    } else {
        Err(Error::last_os_error())
    }
}

pub fn set_watchpoint(pid: i32, address: usize, size: usize, type_: i32) -> Result<i32, Error> {
    let result: bool = unsafe { debugger_new(pid) };

    if !result {
        return Err(Error::new(
            std::io::ErrorKind::Other,
            "Failed to create debugger instance",
        ));
    }
    let result = unsafe { set_watchpoint_native(address, size, type_) };
    if result == 0 {
        Ok(result as i32)
    } else {
        Err(Error::last_os_error())
    }
}

pub fn remove_watchpoint(address: usize) -> Result<i32, Error> {
    let result = unsafe { remove_watchpoint_native(address) };
    if result == 0 {
        Ok(result as i32)
    } else {
        Err(Error::last_os_error())
    }
}

pub fn set_breakpoint(pid: i32, address: usize, hit_count: i32) -> Result<i32, Error> {
    let result: bool = unsafe { debugger_new(pid) };
    if !result {
        return Err(Error::new(
            std::io::ErrorKind::Other,
            "Failed to create debugger instance",
        ));
    }
    let result = unsafe { set_breakpoint_native(address, hit_count) };
    if result == 0 {
        Ok(result)
    } else {
        Err(Error::last_os_error())
    }
}

pub fn remove_breakpoint(address: usize) -> Result<i32, Error> {
    let result = unsafe { remove_breakpoint_native(address) };
    if result == 0 {
        Ok(result)
    } else {
        Err(Error::last_os_error())
    }
}

pub fn native_api_init(mode: i32) {
    unsafe {
        native_init(mode);
    }
}

pub fn enum_modules(pid: i32) -> Result<Vec<serde_json::Value>, String> {
    let mut count: usize = 0;
    let module_info_ptr = unsafe { enummodule_native(pid, &mut count) };

    if module_info_ptr.is_null() {
        return Err("Failed to enumerate modules".to_string());
    }

    let module_info_slice = unsafe { std::slice::from_raw_parts(module_info_ptr, count) };

    let mut modules = Vec::new();

    for info in module_info_slice {
        let module_name = unsafe {
            CStr::from_ptr(info.modulename)
                .to_string_lossy()
                .into_owned()
        };

        modules.push(json!({
            "base": info.base,
            "size": info.size,
            "is_64bit": info.is_64bit,
            "modulename": module_name
        }));

        unsafe { libc::free(info.modulename as *mut libc::c_void) };
    }

    unsafe { libc::free(module_info_ptr as *mut libc::c_void) };

    Ok(modules)
}

pub fn enum_regions(pid: i32) -> Result<Vec<serde_json::Value>, String> {
    let mut buffer = vec![0u8; 1024 * 1024]; // 1MB buffer

    unsafe {
        enumerate_regions_to_buffer(pid, buffer.as_mut_ptr(), buffer.len());
    }

    let buffer_cstring = unsafe { CString::from_vec_unchecked(buffer) };
    let buffer_string = match buffer_cstring.into_string() {
        Ok(s) => s,
        Err(_) => return Err("Failed to convert buffer to string".to_string()),
    };

    let buffer_reader = BufReader::new(buffer_string.as_bytes());
    let mut regions = Vec::new();

    for line in buffer_reader.lines() {
        if let Ok(line) = line {
            let parts: Vec<&str> = line.split_whitespace().collect();

            if parts.len() >= 5 {
                let addresses: Vec<&str> = parts[0].split('-').collect();
                if addresses.len() == 2 {
                    let region = json!({
                        "start_address": addresses[0],
                        "end_address": addresses[1],
                        "protection": parts[1],
                        "file_path": if parts.len() > 5 {
                            parts[5..].join(" ")
                        } else {
                            "".to_string()
                        }
                    });
                    regions.push(region);
                }
            }
        }
    }

    if regions.is_empty() {
        Err("No regions found".to_string())
    } else {
        Ok(regions)
    }
}

pub fn get_application_info(pid: i32) -> Result<String, Error> {
    let result = unsafe {
        let raw_ptr = get_application_info_native(pid as c_int);
        if raw_ptr.is_null() {
            return Err(Error::new(
                std::io::ErrorKind::Other,
                "Failed to get application info",
            ));
        }

        let c_str = CStr::from_ptr(raw_ptr);
        let result_str = c_str.to_str().unwrap_or("Invalid UTF-8").to_owned();
        libc::free(raw_ptr as *mut libc::c_void);

        result_str
    };

    Ok(result)
}
