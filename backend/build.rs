extern crate cc;
use std::process::Command;

fn get_git_hash() -> String {
    let output = Command::new("git").args(&["rev-parse", "HEAD"]).output();

    match output {
        Ok(output) if output.status.success() => {
            String::from_utf8_lossy(&output.stdout).trim().to_string()
        }
        _ => "unknown".to_string(),
    }
}

fn main() {
    println!("cargo:rustc-link-search=native=/usr/local/lib");
    let git_hash = get_git_hash();
    println!("cargo:rustc-env=GIT_HASH={}", git_hash);

    let mut build = cc::Build::new();
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap();
    println!("cargo:rustc-env=TARGET_OS={}", target_os);

    if cfg!(windows) {
        println!("cargo:rustc-cfg=host_os=\"windows\"");
    }

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
            build.file("src/cpp/src/native_darwin.mm");
        }
        "ios" => {
            println!("cargo:rustc-link-arg=-lc++");
            build.file("src/cpp/src/native_darwin.mm");
        }
        "android" => {
            build.cpp_link_stdlib("stdc++");
            println!("cargo:rustc-link-lib=static=c++_static");
            println!("cargo:rustc-link-lib=static=c++abi");
            println!("cargo:rustc-link-lib=static=c++");
            build.flag_if_supported("-DTARGET_IS_ANDROID");
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
