use chrono::Local;
use ctor::ctor;
use include_dir::{include_dir, Dir};
use log::info;
use log::LevelFilter;
use std::env;
use std::io::{stdout, Write};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use warp::http::Response;
use warp::http::Uri;
use warp::path::Tail;
use warp::Filter;

mod allocator;
mod api;
mod logger;
mod serve;
mod util;

#[ctor]
fn init() {
    env::set_var("RUST_BACKTRACE", "full");
}

#[tokio::main]
async fn main() {
    println!("memory_server has started listening on port 3030.");
    std::env::set_var("MEMORY_SERVER_RUNNING_MODE", "normal");

    env_logger::init_from_env(env_logger::Env::default().default_filter_or("info"));

    serve::serve(0).await;
}
