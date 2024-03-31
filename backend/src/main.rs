use ctor::ctor;
use include_dir::{include_dir, Dir};
use std::io::{stdout, Write};
use std::sync::{Arc, Mutex};
use warp::http::Response;
use warp::http::Uri;
use warp::path::Tail;
use warp::Filter;

mod api;
mod util;

static STATIC_DIR: Dir = include_dir!("../frontend/out");

async fn serve_static(path: String) -> Result<impl warp::Reply, warp::Rejection> {
    match STATIC_DIR.get_file(&path) {
        Some(file) => {
            let mime_type = mime_guess::from_path(&path).first_or_octet_stream();
            Ok(Response::builder()
                .header("content-type", mime_type.as_ref())
                .body(file.contents()))
        }
        None => Err(warp::reject::not_found()),
    }
}

#[tokio::main]
async fn main() {
    println!("memory_server has started listening on port 3030.");

    let cors = warp::cors()
        .allow_any_origin()
        .allow_headers(vec!["*", "Content-Type"])
        .allow_methods(vec!["GET", "POST", "OPTIONS"]);

    let pid_state = Arc::new(Mutex::new(None));

    let static_files = warp::path::tail()
        .map(|tail: Tail| tail.as_str().to_string())
        .and_then(serve_static); //warp::path::param().and_then(|param: String| serve_static(param));

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
        .and(warp::get())
        .and(warp::query::<api::ReadMemoryRequest>())
        .and(api::with_state(pid_state.clone()))
        .and_then(|read_memory_request, pid_state| async move {
            api::read_memory_handler(pid_state, read_memory_request).await
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
        .or(enumprocess)
        .or(static_files)
        .with(cors);

    warp::serve(routes).run(([0, 0, 0, 0], 3030)).await;
}
