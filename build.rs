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

    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap();
    match target_os.as_str() {
        "ios" => {
            build.file("src/cpp/src/native_darwin.cpp");
        }
        "android" => {
            build.cpp_link_stdlib("stdc++");
            println!("cargo:rustc-link-lib=static=c++_static");
            println!("cargo:rustc-link-lib=static=c++abi");
            println!("cargo:rustc-link-lib=static=c++");
            println!("cargo:rustc-cfg=TARGET_IS_ANDROID");
            build.file("src/cpp/src/native_linux.cpp");
        }
        _ => {
            panic!("Unsupported target OS");
        }
    }

    build.compile("libnative.a");
}
