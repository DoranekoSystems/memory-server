use ctor::ctor;
use std::net::IpAddr;
use std::thread;

mod allocator;
mod api;
mod logger;
mod native_bridge;
mod pointerscan;
mod request;
mod serve;
mod util;

#[ctor]
fn main() {
    thread::spawn(|| {
        let runtime = tokio::runtime::Runtime::new().unwrap();

        runtime.block_on(async {
            std::env::set_var("MEMORY_SERVER_RUNNING_MODE", "embedded");

            let host: IpAddr = "0.0.0.0".parse().unwrap();
            let port: u16 = 3030;
            println!(
                "memory_spy has started listening on host {} and port {}.",
                host, port
            );
            logger::init_log();
            serve::serve(1, host, port).await;
        });
    });
}
