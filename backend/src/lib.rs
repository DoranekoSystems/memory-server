use ctor::ctor;
use include_dir::{include_dir, Dir};
use std::env;
use std::future::Future;
use std::io::{stdout, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use tokio::runtime::Builder;
use warp::http::Response;
use warp::path::Tail;
use warp::Filter;

mod allocator;
mod api;
mod logger;
mod serve;
mod util;

#[ctor]
fn main() {
    thread::spawn(|| {
        let runtime = tokio::runtime::Runtime::new().unwrap();

        let handle = runtime.block_on(async {
            println!("memory_server has started listening on port 3030.");
            std::env::set_var("MEMORY_SERVER_RUNNING_MODE", "embedded");

            env_logger::init_from_env(env_logger::Env::default().default_filter_or("info"));

            serve::serve(1).await;
        });
    });
}
