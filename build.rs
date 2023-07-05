extern crate cc;

fn main() {
    println!("cargo:rustc-link-search=native=/usr/local/lib");

    let mut build = cc::Build::new();
    build
        .cpp(true)
        .warnings(true)
        .flag("-std=c++17")
        .flag("-Wall")
        .flag("-Wextra")
        .flag("-v")
        .flag("-g");

    // ターゲットプラットフォームに基づいてソースファイルを選択します。
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap();
    match target_os.as_str() {
        "ios" => {
            build.file("src/cpp/src/native_ios.cpp");
        }
        "android" => {
            build.file("src/cpp/src/native_android.cpp");
        }
        _ => {
            panic!("Unsupported target OS");
        }
    }

    build.compile("libnative.a");
}
