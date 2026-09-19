// 哥哥科技工程补丁：保留超大 ICO 的野路子，同时修正实际文件生成链路。
// 本文件在 app.js 之后加载，只覆盖需要修的函数，便于以后和上游做文件级 diff。

function getSelectedSizes() {
    const sizes = [];
    document.querySelectorAll('.size-checkbox input:checked').forEach(cb => {
        sizes.push(Number(cb.value));
    });

    const custom = customSizes.value.trim();
    if (custom) {
        const customList = custom.split(',')
            .map(s => Number(s.trim()))
            .filter(s => Number.isInteger(s) && s > 0);
        sizes.push(...customList);
    }

    return [...new Set(sizes.filter(s => Number.isInteger(s) && s > 0))];
}

async function createIcoFile(images, sizes, colorModeValue, resizeModeValue, onProgress) {
    const icoImages = [];

    for (let i = 0; i < images.length; i++) {
        const imgData = images[i];
        const img = await loadImage(imgData.preview);
        const iconImages = [];

        for (const size of sizes) {
            const canvas = resizeImage(img, size, resizeModeValue);
            const bmpData = canvasToBmp(canvas, colorModeValue === 'rgba');
            iconImages.push({
                size,
                data: bmpData,
                bitsPerPixel: colorModeValue === 'rgba' ? 32 : 24
            });
        }

        const icoBuffer = buildIcoFile(iconImages);
        icoImages.push({
            name: imgData.name.replace(/\.[^/.]+$/, '') + '.ico',
            data: icoBuffer
        });

        if (onProgress) onProgress(i + 1, images.length);
    }

    return icoImages;
}

function buildIcoFile(iconImages) {
    const numImages = iconImages.length;
    const headerSize = 6 + numImages * 16;
    let dataOffset = headerSize;
    let totalSize = headerSize;

    for (const img of iconImages) totalSize += img.data.length;

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    let offset = 0;

    view.setUint16(offset, 0, true); offset += 2;
    view.setUint16(offset, 1, true); offset += 2;
    view.setUint16(offset, numImages, true); offset += 2;

    for (const img of iconImages) {
        const size = img.size;
        // ICO 目录项只有 1 byte 宽高；>=256 仍沿用原项目的 0 写法。
        // 真正的像素尺寸保存在后面的 BMP payload 中，故继续允许 1024/4096 等大图。
        view.setUint8(offset++, size > 255 ? 0 : size);
        view.setUint8(offset++, size > 255 ? 0 : size);
        view.setUint8(offset++, 0);
        view.setUint8(offset++, 0);
        view.setUint16(offset, 1, true); offset += 2;
        view.setUint16(offset, img.bitsPerPixel || 32, true); offset += 2;
        view.setUint32(offset, img.data.length, true); offset += 4;
        view.setUint32(offset, dataOffset, true); offset += 4;
        dataOffset += img.data.length;
    }

    for (const img of iconImages) {
        new Uint8Array(buffer, offset).set(img.data);
        offset += img.data.length;
    }

    return new Uint8Array(buffer);
}

// ICNS 中能真正装 PNG 的槽位。一个像素尺寸可同时写普通槽和 Retina @2x 槽。
function sizeToIcnsTypes(size) {
    const map = {
        16: [0x69637034],                         // icp4
        24: [0x73623234],                         // sb24
        32: [0x69637035, 0x69633131],            // icp5 + ic11 (16@2x)
        36: [0x69637342],                         // icsB (18@2x)
        48: [0x53423234, 0x69637036],            // SB24 (24@2x) + icp6
        64: [0x69633132],                         // ic12 (32@2x)
        128: [0x69633037],                        // ic07
        256: [0x69633038, 0x69633133],           // ic08 + ic13 (128@2x)
        512: [0x69633039, 0x69633134],            // ic09 + ic14 (256@2x)
        1024: [0x69633130],                       // ic10 (512@2x)
    };
    return map[size] || [];
}

function buildIcnsFile(iconImages) {
    let totalSize = 8;
    const entries = [];

    for (const img of iconImages) {
        const iconTypes = sizeToIcnsTypes(img.size);
        const entrySize = 8 + img.data.length;
        for (const iconType of iconTypes) {
            entries.push({ type: iconType, data: img.data, entrySize });
            totalSize += entrySize;
        }
    }

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    let offset = 0;

    view.setUint32(offset, 0x69636E73, false); offset += 4; // icns
    view.setUint32(offset, totalSize, false); offset += 4;

    for (const entry of entries) {
        view.setUint32(offset, entry.type, false); offset += 4;
        view.setUint32(offset, entry.entrySize, false); offset += 4;
        new Uint8Array(buffer, offset).set(entry.data);
        offset += entry.data.length;
    }

    return new Uint8Array(buffer);
}

async function createIcnsFile(images, sizes, colorModeValue, resizeModeValue, onProgress) {
    const icnsImages = [];
    // 72/96/768 和 1024 以上继续留给 ICO/自定义尺寸；这里不伪造 macOS 不认识的类型。
    const validSizes = sizes.filter(s => sizeToIcnsTypes(s).length > 0);
    if (validSizes.length === 0) {
        throw new Error('没有可写入 ICNS 的尺寸：可用 16, 24, 32, 36, 48, 64, 128, 256, 512, 1024');
    }

    for (let i = 0; i < images.length; i++) {
        const imgData = images[i];
        const img = await loadImage(imgData.preview);
        const pngBuffers = [];

        for (const size of validSizes) {
            const canvas = resizeImage(img, size, resizeModeValue);
            if (colorModeValue === 'rgb') {
                const ctx = canvas.getContext('2d');
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const pixels = imageData.data;
                for (let p = 3; p < pixels.length; p += 4) pixels[p] = 255;
                ctx.putImageData(imageData, 0, 0);
            }
            pngBuffers.push({ size, data: canvasToPngBuffer(canvas) });
        }

        icnsImages.push({
            name: imgData.name.replace(/\.[^/.]+$/, '') + '.icns',
            data: buildIcnsFile(pngBuffers)
        });

        if (onProgress) onProgress(i + 1, images.length);
    }

    return icnsImages;
}

function arrayBufferToBase64(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    // 24576 可被 3 整除，每块 Base64 可直接拼接；避免 4096 ICO 一次构造超大 binary string。
    const chunkSize = 24576;
    let base64 = '';
    for (let start = 0; start < bytes.byteLength; start += chunkSize) {
        const end = Math.min(start + chunkSize, bytes.byteLength);
        let binary = '';
        for (let i = start; i < end; i++) binary += String.fromCharCode(bytes[i]);
        base64 += btoa(binary);
    }
    return base64;
}

async function createZip(files) {
    const zipParts = [];
    const centralDir = [];
    let offset = 0;

    for (const file of files) {
        const nameBytes = new TextEncoder().encode(file.name);
        const data = file.data;

        const localHeader = new ArrayBuffer(30 + nameBytes.length);
        const lhView = new DataView(localHeader);
        let pos = 0;
        lhView.setUint32(pos, 0x04034b50, true); pos += 4;
        lhView.setUint16(pos, 20, true); pos += 2;
        lhView.setUint16(pos, 0x0800, true); pos += 2; // UTF-8 filename
        lhView.setUint16(pos, 0, true); pos += 2;
        lhView.setUint16(pos, 0, true); pos += 2;
        lhView.setUint16(pos, 0, true); pos += 2;
        lhView.setUint32(pos, crc32(data), true); pos += 4;
        lhView.setUint32(pos, data.length, true); pos += 4;
        lhView.setUint32(pos, data.length, true); pos += 4;
        lhView.setUint16(pos, nameBytes.length, true); pos += 2;
        lhView.setUint16(pos, 0, true); pos += 2;
        new Uint8Array(localHeader).set(nameBytes, pos);

        zipParts.push(new Uint8Array(localHeader));
        zipParts.push(data);

        const cdHeader = new ArrayBuffer(46 + nameBytes.length);
        const cdView = new DataView(cdHeader);
        pos = 0;
        cdView.setUint32(pos, 0x02014b50, true); pos += 4;
        cdView.setUint16(pos, 20, true); pos += 2;
        cdView.setUint16(pos, 20, true); pos += 2;
        cdView.setUint16(pos, 0x0800, true); pos += 2; // UTF-8 filename
        cdView.setUint16(pos, 0, true); pos += 2;
        cdView.setUint16(pos, 0, true); pos += 2;
        cdView.setUint16(pos, 0, true); pos += 2;
        cdView.setUint32(pos, crc32(data), true); pos += 4;
        cdView.setUint32(pos, data.length, true); pos += 4;
        cdView.setUint32(pos, data.length, true); pos += 4;
        cdView.setUint16(pos, nameBytes.length, true); pos += 2;
        cdView.setUint16(pos, 0, true); pos += 2;
        cdView.setUint16(pos, 0, true); pos += 2;
        cdView.setUint16(pos, 0, true); pos += 2;
        cdView.setUint16(pos, 0, true); pos += 2;
        cdView.setUint32(pos, 0, true); pos += 4;
        cdView.setUint32(pos, offset, true); pos += 4;
        new Uint8Array(cdHeader).set(nameBytes, pos);

        centralDir.push(new Uint8Array(cdHeader));
        offset += localHeader.byteLength + data.length;
    }

    const centralDirOffset = offset;
    const centralDirSize = centralDir.reduce((sum, cd) => sum + cd.length, 0);

    const eocd = new ArrayBuffer(22);
    const eocdView = new DataView(eocd);
    eocdView.setUint32(0, 0x06054b50, true);
    eocdView.setUint16(4, 0, true);
    eocdView.setUint16(6, 0, true);
    eocdView.setUint16(8, files.length, true);
    eocdView.setUint16(10, files.length, true);
    eocdView.setUint32(12, centralDirSize, true);
    eocdView.setUint32(16, centralDirOffset, true);
    eocdView.setUint16(20, 0, true);

    const totalSize = offset + centralDirSize + 22;
    const zipData = new Uint8Array(totalSize);
    let zipPos = 0;

    for (const part of zipParts) {
        zipData.set(part, zipPos);
        zipPos += part.length;
    }
    for (const cd of centralDir) {
        zipData.set(cd, zipPos);
        zipPos += cd.length;
    }
    zipData.set(new Uint8Array(eocd), zipPos);

    return new Blob([zipData], { type: 'application/zip' });
}
