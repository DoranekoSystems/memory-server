use std::sync::{Arc, Mutex};
use warp::Filter;

mod api;
mod util;

#[tokio::main]
async fn main() {
    println!("memory_server has started listening on port 3030.");

    let pid_state = Arc::new(Mutex::new(None));

    let enumprocess = warp::path!("enumprocess")
        .and(warp::get())
        .and_then(api::enumerate_process_handler);

    let open_process = warp::path!("openprocess")
        .and(warp::post())
        .and(warp::body::json())
        .and(api::with_state(pid_state.clone()))
        .and_then(|open_process, pid_state| async move {
            api::open_process_handler(pid_state, open_process).await
        });

    let read_memory = warp::path!("readmemory")
        .and(warp::post())
        .and(warp::body::json())
        .and(api::with_state(pid_state.clone()))
        .and_then(|read_memory, pid_state| async move {
            api::read_memory_handler(pid_state, read_memory).await
        });

    let write_memory = warp::path!("writememory")
        .and(warp::post())
        .and(warp::body::json())
        .and(api::with_state(pid_state.clone()))
        .and_then(|write_memory, pid_state| async move {
            api::write_memory_handler(pid_state, write_memory).await
        });

    let memory_scan = warp::path!("memoryscan")
        .and(warp::post())
        .and(warp::body::json())
        .and(api::with_state(pid_state.clone()))
        .and_then(|scan_request, pid_state| async move {
            api::memory_scan_handler(pid_state, scan_request).await
        });
    let memory_filter = warp::path!("memoryfilter")
        .and(warp::post())
        .and(warp::body::json())
        .and(api::with_state(pid_state.clone()))
        .and_then(|filter_request, pid_state| async move {
            api::memory_filter_handler(pid_state, filter_request).await
        });

    let enumregions = warp::path!("enumregions")
        .and(warp::get())
        .and(api::with_state(pid_state.clone()))
        .and_then(|pid_state| async move { api::enumerate_regions_handler(pid_state).await });
    let routes = open_process
        .or(read_memory)
        .or(write_memory)
        .or(memory_scan)
        .or(memory_filter)
        .or(enumregions)
        .or(enumprocess);

    warp::serve(routes).run(([0, 0, 0, 0], 3030)).await;
}
