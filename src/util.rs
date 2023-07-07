pub fn binary_search(buffer: &[u8], pattern: &[u8], increment: usize) -> Vec<usize> {
    let mut positions = Vec::new();
    let mut offset = 0;

    while offset < buffer.len() {
        if let Some(pos) = buffer[offset..]
            .windows(pattern.len())
            .position(|window| window == pattern)
        {
            positions.push(offset + pos);
            offset += pos + increment;
        } else {
            break;
        }
    }
    positions
}

pub fn kmp_search(haystack: &[u8], needle: &[u8]) -> Vec<usize> {
    let mut fail = vec![0; needle.len()];
    let mut pos = 1;
    let mut cnd = 0;

    while pos < needle.len() {
        if needle[pos] == needle[cnd] {
            cnd += 1;
            fail[pos] = cnd;
            pos += 1;
        } else if cnd > 0 {
            cnd = fail[cnd - 1];
        } else {
            fail[pos] = 0;
            pos += 1;
        }
    }

    let mut i = 0;
    let mut m = 0;
    let mut matches = Vec::new();

    while m + i < haystack.len() {
        if needle[i] == haystack[m + i] {
            if i == needle.len() - 1 {
                matches.push(m);
                m += 1;
                i = 0;
            } else {
                i += 1;
            }
        } else {
            if i > 0 {
                m += i - fail[i - 1];
                i = fail[i - 1];
            } else {
                m += 1;
            }
        }
    }

    matches
}
