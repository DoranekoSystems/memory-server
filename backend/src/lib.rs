use ctor::ctor;
use include_dir::{include_dir, Dir};
use std::env;
use std::future::Future;
use std::io::{stdout, Write};
use std::sync::{Arc, Mutex};
use tokio::runtime::Builder;
use warp::http::Response;
use warp::path::Tail;
use warp::Filter;

mod allocator;
mod api;
mod logger;
mod util;
use std::thread;

static STATIC_DIR: Dir = include_dir!("../frontend/out");

async fn serve_static(path: String) -> Result<impl warp::Reply, warp::Rejection> {
    // Adjustment for include_dir! in windows environment
    let path = {
        #[cfg(host_os = "windows")]
        {
            path.replace("/", "\\")
        }
        #[cfg(not(host_os = "windows"))]
        {
            path
        }
    };
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

#[ctor]
fn main() {
    thread::spawn(|| {
        let runtime = tokio::runtime::Runtime::new().unwrap();

        let handle = runtime.block_on(async {
            println!("memory_server has started listening on port 3030.");
            std::env::set_var("MEMORY_SERVER_RUNNING_MODE", "embedded");

            env_logger::init_from_env(env_logger::Env::default().default_filter_or("info"));

            let pid_state = Arc::new(Mutex::new(None));

            let cors = warp::cors()
                .allow_any_origin()
                .allow_headers(vec!["*", "Content-Type"])
                .allow_methods(vec!["GET", "POST", "OPTIONS"]);

            let static_files = warp::path::tail()
                .map(|tail: Tail| tail.as_str().to_string())
                .and_then(serve_static); //warp::path::param().and_then(|param: String| serve_static(param));

            let enumprocess = warp::path!("enumprocess")
                .and(warp::get())
                .and_then(api::enumerate_process_handler);

            let enummodule = warp::path!("enummodule")
                .and(warp::get())
                .and(api::with_state(pid_state.clone()))
                .and_then(|pid_state| async move { api::enummodule_handler(pid_state).await });

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

            let read_memory_multiple = warp::path!("readmemories")
                .and(warp::post())
                .and(warp::body::content_length_limit(1024 * 1024 * 10)) // 10MB
                .and(warp::body::json::<Vec<api::ReadMemoryRequest>>())
                .and(api::with_state(pid_state.clone()))
                .and_then(|read_memory_requests, pid_state| async move {
                    api::read_memory_multiple_handler(pid_state, read_memory_requests).await
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
                .and_then(
                    |pid_state| async move { api::enumerate_regions_handler(pid_state).await },
                );

            let resolveaddr = warp::path!("resolveaddr")
                .and(warp::get())
                .and(warp::query::<api::ResolveAddrRequest>())
                .and(api::with_state(pid_state.clone()))
                .and_then(|resolve_addr_request, pid_state| async move {
                    api::resolve_addr_handler(pid_state, resolve_addr_request).await
                });

            let server_info = warp::path!("serverinfo")
                .and(warp::get())
                .and_then(api::server_info_handler);

            let routes = open_process
                .or(read_memory)
                .or(read_memory_multiple)
                .or(write_memory)
                .or(memory_scan)
                .or(memory_filter)
                .or(enumregions)
                .or(enumprocess)
                .or(enummodule)
                .or(resolveaddr)
                .or(server_info)
                .or(static_files)
                .with(cors);

            api::native_api_init(1);
            warp::serve(routes).run(([0, 0, 0, 0], 3030)).await;
        });
    });
}
