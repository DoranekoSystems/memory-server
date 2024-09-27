use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct OpenProcessRequest {
    pub pid: i32,
}

#[derive(Deserialize)]
pub struct ReadMemoryRequest {
    pub address: usize,
    pub size: usize,
}

#[derive(Deserialize)]
pub struct ResolveAddrRequest {
    pub query: String,
}

#[derive(Deserialize)]
pub struct WriteMemoryRequest {
    pub address: usize,
    pub buffer: Vec<u8>,
}

#[derive(Deserialize, Clone)]
pub struct MemoryScanRequest {
    pub pattern: String,
    pub address_ranges: Vec<(usize, usize)>,
    pub find_type: String,
    pub data_type: String,
    pub scan_id: String,
    pub align: usize,
    pub return_as_json: bool,
    pub do_suspend: bool,
}

#[derive(Deserialize)]
pub struct MemoryFilterRequest {
    pub pattern: String,
    pub data_type: String,
    pub scan_id: String,
    pub filter_method: String,
    pub return_as_json: bool,
    pub do_suspend: bool,
}

#[derive(Deserialize)]
pub struct ExploreDirectoryRequest {
    pub path: String,
    pub max_depth: i32,
}

#[derive(Deserialize)]
pub struct ReadFileRequest {
    pub path: String,
}

#[derive(Deserialize)]
pub struct SetWatchPointRequest {
    pub address: usize,
    pub size: usize,
    pub _type: String,
}

#[derive(Serialize)]
pub struct SetWatchPointResponse {
    pub success: bool,
    pub message: String,
}

#[derive(Deserialize)]
pub struct RemoveWatchPointRequest {
    pub address: usize,
}

#[derive(Serialize)]
pub struct RemoveWatchPointResponse {
    pub success: bool,
    pub message: String,
}

#[derive(Deserialize)]
pub struct SetBreakPointRequest {
    pub address: usize,
    pub hit_count: i32,
}

#[derive(Serialize)]
pub struct SetBreakPointResponse {
    pub success: bool,
    pub message: String,
}

#[derive(Deserialize)]
pub struct RemoveBreakPointRequest {
    pub address: usize,
}

#[derive(Serialize)]
pub struct RemoveBreakPointResponse {
    pub success: bool,
    pub message: String,
}
