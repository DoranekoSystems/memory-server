use log::info;
use warp::log::Info;

pub fn log(info: Info) {
    info!(
        "{} {} {} {}ms",
        info.method(),
        info.path(),
        info.status(),
        info.elapsed().as_millis(),
    );
}
