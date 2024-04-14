extern crate cc;

fn main() {
    println!("cargo:rustc-link-search=native=/usr/local/lib");

    let mut build = cc::Build::new();
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap();

    if target_os == "windows" {
        build.flag("/std:c++17").flag("/W4").flag("/Zi");
    } else {
        build.flag("-std=c++17").flag("-Wall").flag("-v").flag("-g");
    }
    match target_os.as_str() {
        "windows" => {
            build.file("src/cpp/src/native_windows.cpp");
        }
        "macos" => {
            build.file("src/cpp/src/native_darwin.cpp");
        }
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
        "linux" => {
            build.cpp(true);
            build.file("src/cpp/src/native_linux.cpp");
        }
        _ => {
            panic!("Unsupported target OS");
        }
    }

    build.compile("libnative.a");
}
