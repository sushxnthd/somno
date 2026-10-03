#!/usr/bin/env python3
"""Index only the DROZY ZIP central directory via HTTP range requests."""
from remotezip import RemoteZip

URL = 'https://orbi.uliege.be/bitstream/2268/191620/4/DROZY.zip'
with RemoteZip(URL) as z:
    infos = z.infolist()
    print('TOTAL_MEMBERS', len(infos))
    print('TOTAL_UNCOMPRESSED_GB', round(sum(i.file_size for i in infos) / 1e9, 3))
    keys = ('KSS', 'pvt-rt', 'annotations-auto', 'timestamps')
    sel = [i for i in infos if any(k.lower() in i.filename.lower() for k in keys)]
    print('SELECTED_MEMBERS', len(sel))
    print('SELECTED_COMPRESSED_MB', round(sum(i.compress_size for i in sel) / 1e6, 3))
    print('SELECTED_UNCOMPRESSED_MB', round(sum(i.file_size for i in sel) / 1e6, 3))
    for i in sel[:250]:
        print(f'{i.filename}\t{i.file_size}\t{i.compress_size}')
