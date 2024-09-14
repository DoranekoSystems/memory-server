use ctor::ctor;
use std::net::IpAddr;
use std::thread;

mod allocator;
mod api;
mod logger;
mod serve;
mod util;

#[ctor]
fn main() {
    thread::spawn(|| {
        let runtime = tokio::runtime::Runtime::new().unwrap();

        runtime.block_on(async {
            std::env::set_var("MEMORY_SERVER_RUNNING_MODE", "embedded");

            env_logger::init_from_env(env_logger::Env::default().default_filter_or("info"));

            let host: IpAddr = "0.0.0.0".parse().unwrap();
            let port: u16 = 3031;
            println!(
                "memory_gadget has started listening on host {} and port {}.",
                host, port
            );
            serve::serve(1, host, port).await;
        });
    });
}
