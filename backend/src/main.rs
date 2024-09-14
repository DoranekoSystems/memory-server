use ctor::ctor;

use clap::{Arg, Command};
use std::env;
use std::net::IpAddr;

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
    std::env::set_var("MEMORY_SERVER_RUNNING_MODE", "normal");

    let matches = Command::new("memory_server")
        .version("1.0")
        .about("Dynamic analysis tool")
        .arg(
            Arg::new("port")
                .short('p')
                .long("port")
                .num_args(1)
                .value_name("PORT")
                .help("Sets the port number to listen on"),
        )
        .arg(
            Arg::new("host")
                .short('h')
                .long("host")
                .num_args(1)
                .value_name("HOST")
                .help("Sets the host to listen on"),
        )
        .get_matches();

    let port: u16 = matches
        .get_one("port")
        .map(|s: &String| s.parse().expect("Valid port number"))
        .unwrap_or(3030);

    let host: IpAddr = matches
        .get_one("host")
        .map(|s: &String| s.parse().expect("Valid IP address"))
        .unwrap_or_else(|| "0.0.0.0".parse().unwrap());

    println!(
        "memory_server has started listening on host {} and port {}.",
        host, port
    );

    logger::init_log();
    serve::serve(0, host, port).await;
}
