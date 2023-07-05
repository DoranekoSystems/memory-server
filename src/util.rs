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
