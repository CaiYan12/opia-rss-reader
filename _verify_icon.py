import pefile, struct, hashlib, os

RT_ICON = 3
RT_GROUP = 14

def extract_to_ico(pe_path, out_path):
    pe = pefile.PE(pe_path, fast_load=True)
    pe.parse_data_directories(directories=[pefile.DIRECTORY_ENTRY['IMAGE_DIRECTORY_ENTRY_RESOURCE']])
    icons = {}
    group_data = None
    for entry in pe.DIRECTORY_ENTRY_RESOURCE.entries:
        if entry.id == RT_GROUP:
            for sub in entry.directory.entries:
                for lang in sub.directory.entries:
                    group_data = pe.get_data(lang.data.struct.OffsetToData, lang.data.struct.Size)
        if entry.id == RT_ICON:
            for sub in entry.directory.entries:
                for lang in sub.directory.entries:
                    icons[sub.struct.Id] = pe.get_data(lang.data.struct.OffsetToData, lang.data.struct.Size)
    pe.close()
    if not group_data:
        return None, []
    count = struct.unpack_from('<H', group_data, 4)[0]
    sizes = []
    for i in range(count):
        e = group_data[6+i*14:6+(i+1)*14]
        w = e[0] or 256
        h = e[1] or 256
        sizes.append((w, h))
    ico = struct.pack('<HHH', 0, 1, count)
    offset = 6 + count*14
    entries = []
    for i in range(count):
        e = group_data[6+i*14:6+(i+1)*14]
        bytes_size = struct.unpack_from('<I', e, 8)[0]
        icon_id = struct.unpack_from('<H', e, 12)[0]
        ico += e[:12] + struct.pack('<I', offset)
        entries.append((icon_id, bytes_size))
        offset += bytes_size
    for icon_id, _ in entries:
        ico += icons.get(icon_id, b'')
    with open(out_path, 'wb') as f:
        f.write(ico)
    return ico, sizes

# source
src = r"D:\Dev\opia-rss-reader\resources\icon.ico"
with open(src, 'rb') as f:
    sd = f.read()
src_count = struct.unpack_from('<H', sd, 4)[0]
src_sizes = [(sd[6+i*16] or 256, sd[6+i*16+1] or 256) for i in range(src_count)]
print(f"=== source resources/icon.ico ===")
print(f"  bytes={len(sd)} md5={hashlib.md5(sd).hexdigest()}")
print(f"  count={src_count} sizes={src_sizes}")

for exe in [
    r"D:\Dev\opia-rss-reader\build\win-unpacked\Opia RSS Reader.exe",
    r"D:\Dev\opia-rss-reader\build\OpiaRSSReader-0.1.0-portable.exe",
]:
    name = os.path.basename(exe)
    print(f"\n=== {name} ===")
    out = r"D:\Dev\opia-rss-reader\build\_extracted_" + name.replace(' ', '_').replace('.','_') + ".ico"
    try:
        ico, sizes = extract_to_ico(exe, out)
        if ico is None:
            print("  NO RT_GROUP_ICON (no embedded icon resource)")
        else:
            print(f"  extracted bytes={len(ico)} md5={hashlib.md5(ico).hexdigest()}")
            print(f"  count={len(sizes)} sizes={sizes}")
            print(f"  saved: {out}")
    except Exception as e:
        print(f"  ERROR: {e}")
