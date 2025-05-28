"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseRequest = exports.kvstore = exports.getBufferStores = exports.bufferStore = exports.getProcessor = exports.setMaxGifPages = exports.setMaxGifSizeMB = void 0;
const path = require("path");
const config_1 = require("./config");
const processor_1 = require("./processor");
const image_1 = require("./processor/image");
const style_1 = require("./processor/style");
const index_1 = require("./processor/video/index");
const store_1 = require("./store");
const style = require("./style.json");
const PROCESSOR_MAP = {
    [image_1.ImageProcessor.getInstance().name]: image_1.ImageProcessor.getInstance(),
    [style_1.StyleProcessor.getInstance().name]: style_1.StyleProcessor.getInstance(kvstore()),
    [index_1.VideoProcessor.getInstance().name]: index_1.VideoProcessor.getInstance(),
};
function setMaxGifSizeMB(value) {
    image_1.ImageProcessor.getInstance().setMaxGifSizeMB(value);
}
exports.setMaxGifSizeMB = setMaxGifSizeMB;
function setMaxGifPages(value) {
    image_1.ImageProcessor.getInstance().setMaxGifPages(value);
}
exports.setMaxGifPages = setMaxGifPages;
function getProcessor(name) {
    const processor = PROCESSOR_MAP[name];
    if (!processor) {
        throw new processor_1.InvalidArgument('Can Not find processor');
    }
    return processor;
}
exports.getProcessor = getProcessor;
function bufferStore(p) {
    if (config_1.default.isProd) {
        if (!p) {
            p = config_1.default.srcBucket;
        }
        console.log(`use ${store_1.S3Store.name} s3://${p}`);
        return new store_1.S3Store(p);
    }
    else {
        if (!p) {
            p = path.join(__dirname, '../test/fixtures');
        }
        console.log(`use ${store_1.LocalStore.name} file://${p}`);
        return new store_1.LocalStore(p);
    }
}
exports.bufferStore = bufferStore;
// Get a map of all configured S3 bucket stores
function getBufferStores() {
    const stores = new Map();
    if (config_1.default.isProd) {
        // Add all configured buckets to the map
        for (const bucket of config_1.default.srcBuckets) {
            stores.set(bucket, new store_1.S3Store(bucket));
        }
        console.log(`Initialized ${stores.size} S3 bucket stores: ${Array.from(stores.keys()).join(', ')}`);
    }
    else {
        // For local development, use a single local store
        const localPath = path.join(__dirname, '../test/fixtures');
        stores.set('default', new store_1.LocalStore(localPath));
        console.log(`use ${store_1.LocalStore.name} file://${localPath}`);
    }
    return stores;
}
exports.getBufferStores = getBufferStores;
function kvstore() {
    if (config_1.default.isProd) {
        console.log(`use ${store_1.DynamoDBStore.name}`);
        return new store_1.DynamoDBStore(config_1.default.styleTableName);
    }
    else {
        console.log(`use ${store_1.MemKVStore.name}`);
        return new store_1.MemKVStore(style);
    }
}
exports.kvstore = kvstore;
function parseRequest(uri, query) {
    var _a, _b;
    uri = uri.replace(/^\//, ''); // trim leading slash "/"
    const parts = uri.split(/@?!/, 2);
    if (parts.length === 1) {
        const x_oss_process = (_a = query['x-oss-process']) !== null && _a !== void 0 ? _a : '';
        return {
            uri: uri,
            actions: x_oss_process.split('/').filter(x => x),
        };
    }
    const stylename = ((_b = parts[1]) !== null && _b !== void 0 ? _b : '').trim();
    if (!stylename) {
        throw new processor_1.InvalidArgument('Empty style name');
    }
    return {
        uri: parts[0],
        actions: ['style', stylename],
    };
}
exports.parseRequest = parseRequest;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVmYXVsdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9kZWZhdWx0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDZCQUE2QjtBQUU3QixxQ0FBOEI7QUFDOUIsMkNBQTBEO0FBQzFELDZDQUFtRDtBQUNuRCw2Q0FBbUQ7QUFDbkQsbURBQXlEO0FBQ3pELG1DQUFpRztBQUNqRyxzQ0FBc0M7QUFFdEMsTUFBTSxhQUFhLEdBQWtDO0lBQ25ELENBQUMsc0JBQWMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxzQkFBYyxDQUFDLFdBQVcsRUFBRTtJQUNqRSxDQUFDLHNCQUFjLENBQUMsV0FBVyxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsc0JBQWMsQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDMUUsQ0FBQyxzQkFBYyxDQUFDLFdBQVcsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLHNCQUFjLENBQUMsV0FBVyxFQUFFO0NBQ2xFLENBQUM7QUFFRixTQUFnQixlQUFlLENBQUMsS0FBYTtJQUMzQyxzQkFBYyxDQUFDLFdBQVcsRUFBRSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUN0RCxDQUFDO0FBRkQsMENBRUM7QUFFRCxTQUFnQixjQUFjLENBQUMsS0FBYTtJQUMxQyxzQkFBYyxDQUFDLFdBQVcsRUFBRSxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUNyRCxDQUFDO0FBRkQsd0NBRUM7QUFFRCxTQUFnQixZQUFZLENBQUMsSUFBWTtJQUN2QyxNQUFNLFNBQVMsR0FBRyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDdEMsSUFBSSxDQUFDLFNBQVMsRUFBRTtRQUNkLE1BQU0sSUFBSSwyQkFBZSxDQUFDLHdCQUF3QixDQUFDLENBQUM7S0FDckQ7SUFDRCxPQUFPLFNBQVMsQ0FBQztBQUNuQixDQUFDO0FBTkQsb0NBTUM7QUFFRCxTQUFnQixXQUFXLENBQUMs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QyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7U0FDakQsQ0FBQztLQUNIO0lBQ0QsTUFBTSxTQUFTLEdBQUcsQ0FBQyxNQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsbUNBQUksRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDMUMsSUFBSSxDQUFDLFNBQVMsRUFBRTtRQUNkLE1BQU0sSUFBSSwyQkFBZSxDQUFDLGtCQUFrQixDQUFDLENBQUM7S0FDL0M7SUFDRCxPQUFPO1FBQ0wsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDYixPQUFPLEVBQUUsQ0FBQyxPQUFPLEVBQUUsU0FBUyxDQUFDO0tBQzlCLENBQUM7QUFDSixDQUFDO0FBbEJELG9DQWtCQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBQYXJzZWRVcmxRdWVyeSB9IGZyb20gJ3F1ZXJ5c3RyaW5nJztcbmltcG9ydCBjb25maWcgZnJvbSAnLi9jb25maWcnO1xuaW1wb3J0IHsgSW52YWxpZEFyZ3VtZW50LCBJUHJvY2Vzc29yIH0gZnJvbSAnLi9wcm9jZXNzb3InO1xuaW1wb3J0IHsgSW1hZ2VQcm9jZXNzb3IgfSBmcm9tICcuL3Byb2Nlc3Nvci9pbWFnZSc7XG5pbXBvcnQgeyBTdHlsZVByb2Nlc3NvciB9IGZyb20gJy4vcHJvY2Vzc29yL3N0eWxlJztcbmltcG9ydCB7IFZpZGVvUHJvY2Vzc29yIH0gZnJvbSAnLi9wcm9jZXNzb3IvdmlkZW8vaW5kZXgnO1xuaW1wb3J0IHsgSUJ1ZmZlclN0b3JlLCBTM1N0b3JlLCBMb2NhbFN0b3JlLCBNZW1LVlN0b3JlLCBEeW5hbW9EQlN0b3JlLCBJS1ZTdG9yZSB9IGZyb20gJy4vc3RvcmUnO1xuaW1wb3J0ICogYXMgc3R5bGUgZnJvbSAnLi9zdHlsZS5qc29uJztcblxuY29uc3QgUFJPQ0VTU09SX01BUDogeyBba2V5OiBzdHJpbmddOiBJUHJvY2Vzc29yIH0gPSB7XG4gIFtJbWFnZVByb2Nlc3Nvci5nZXRJbnN0YW5jZSgpLm5hbWVdOiBJbWFnZVByb2Nlc3Nvci5nZXRJbnN0YW5jZSgpLFxuICBbU3R5bGVQcm9jZXNzb3IuZ2V0SW5zdGFuY2UoKS5uYW1lXTogU3R5bGVQcm9jZXNzb3IuZ2V0SW5zdGFuY2Uoa3ZzdG9yZSgpKSxcbiAgW1ZpZGVvUHJvY2Vzc29yLmdldEluc3RhbmNlKCkubmFtZV06IFZpZGVvUHJvY2Vzc29yLmdldEluc3RhbmNlKCksXG59O1xuXG5leHBvcnQgZnVuY3Rpb24gc2V0TWF4R2lmU2l6ZU1CKHZhbHVlOiBudW1iZXIpIHtcbiAgSW1hZ2VQcm9jZXNzb3IuZ2V0SW5zdGFuY2UoKS5zZXRNYXhHaWZTaXplTUIodmFsdWUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2V0TWF4R2lmUGFnZXModmFsdWU6IG51bWJlcikge1xuICBJbWFnZVByb2Nlc3Nvci5nZXRJbnN0YW5jZSgpLnNldE1heEdpZlBhZ2VzKHZhbHVlKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFByb2Nlc3NvcihuYW1lOiBzdHJpbmcpOiBJUHJvY2Vzc29yIHtcbiAgY29uc3QgcHJvY2Vzc29yID0gUFJPQ0VTU09SX01BUFtuYW1lXTtcbiAgaWYgKCFwcm9jZXNzb3IpIHtcbiAgICB0aHJvdyBuZXcgSW52YWxpZEFyZ3VtZW50KCdDYW4gTm90IGZpbmQgcHJvY2Vzc29yJyk7XG4gIH1cbiAgcmV0dXJuIHByb2Nlc3Nvcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGJ1ZmZlclN0b3JlKHA/OiBzdHJpbmcpOiBJQnVmZmVyU3RvcmUge1xuICBpZiAoY29uZmlnLmlzUHJvZCkge1xuICAgIGlmICghcCkgeyBwID0gY29uZmlnLnNyY0J1Y2tldDsgfVxuICAgIGNvbnNvbGUubG9nKGB1c2UgJHtTM1N0b3JlLm5hbWV9IHMzOi8vJHtwfWApO1xuICAgIHJldHVybiBuZXcgUzNTdG9yZShwKTtcbiAgfSBlbHNlIHtcbiAgICBpZiAoIXApIHsgcCA9IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi90ZXN0L2ZpeHR1cmVzJyk7IH1cbiAgICBjb25zb2xlLmxvZyhgdXNlICR7TG9jYWxTdG9yZS5uYW1lfSBmaWxlOi8vJHtwfWApO1xuICAgIHJldHVybiBuZXcgTG9jYWxTdG9yZShwKTtcbiAgfVxufVxuXG4vLyBHZXQgYSBtYXAgb2YgYWxsIGNvbmZpZ3VyZWQgUzMgYnVja2V0IHN0b3Jlc1xuZXhwb3J0IGZ1bmN0aW9uIGdldEJ1ZmZlclN0b3JlcygpOiBNYXA8c3RyaW5nLCBJQnVmZmVyU3RvcmU+IHtcbiAgY29uc3Qgc3RvcmVzID0gbmV3IE1hcDxzdHJpbmcsIElCdWZmZXJTdG9yZT4oKTtcbiAgXG4gIGlmIChjb25maWcuaXNQcm9kKSB7XG4gICAgLy8gQWRkIGFsbCBjb25maWd1cmVkIGJ1Y2tldHMgdG8gdGhlIG1hcFxuICAgIGZvciAoY29uc3QgYnVja2V0IG9mIGNvbmZpZy5zcmNCdWNrZXRzKSB7XG4gICAgICBzdG9yZXMuc2V0KGJ1Y2tldCwgbmV3IFMzU3RvcmUoYnVja2V0KSk7XG4gICAgfVxuICAgIGNvbnNvbGUubG9nKGBJbml0aWFsaXplZCAke3N0b3Jlcy5zaXplfSBTMyBidWNrZXQgc3RvcmVzOiAke0FycmF5LmZyb20oc3RvcmVzLmtleXMoKSkuam9pbignLCAnKX1gKTtcbiAgfSBlbHNlIHtcbiAgICAvLyBGb3IgbG9jYWwgZGV2ZWxvcG1lbnQsIHVzZSBhIHNpbmdsZSBsb2NhbCBzdG9yZVxuICAgIGNvbnN0IGxvY2FsUGF0aCA9IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi90ZXN0L2ZpeHR1cmVzJyk7XG4gICAgc3RvcmVzLnNldCgnZGVmYXVsdCcsIG5ldyBMb2NhbFN0b3JlKGxvY2FsUGF0aCkpO1xuICAgIGNvbnNvbGUubG9nKGB1c2UgJHtMb2NhbFN0b3JlLm5hbWV9IGZpbGU6Ly8ke2xvY2FsUGF0aH1gKTtcbiAgfVxuICBcbiAgcmV0dXJuIHN0b3Jlcztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGt2c3RvcmUoKTogSUtWU3RvcmUge1xuICBpZiAoY29uZmlnLmlzUHJvZCkge1xuICAgIGNvbnNvbGUubG9nKGB1c2UgJHtEeW5hbW9EQlN0b3JlLm5hbWV9YCk7XG4gICAgcmV0dXJuIG5ldyBEeW5hbW9EQlN0b3JlKGNvbmZpZy5zdHlsZVRhYmxlTmFtZSk7XG4gIH0gZWxzZSB7XG4gICAgY29uc29sZS5sb2coYHVzZSAke01lbUtWU3RvcmUubmFtZX1gKTtcbiAgICByZXR1cm4gbmV3IE1lbUtWU3RvcmUoc3R5bGUpO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVJlcXVlc3QodXJpOiBzdHJpbmcsIHF1ZXJ5OiBQYXJzZWRVcmxRdWVyeSk6IHsgdXJpOiBzdHJpbmc7IGFjdGlvbnM6IHN0cmluZ1tdIH0ge1xuICB1cmkgPSB1cmkucmVwbGFjZSgvXlxcLy8sICcnKTsgLy8gdHJpbSBsZWFkaW5nIHNsYXNoIFwiL1wiXG4gIGNvbnN0IHBhcnRzID0gdXJpLnNwbGl0KC9APyEvLCAyKTtcbiAgaWYgKHBhcnRzLmxlbmd0aCA9PT0gMSkge1xuICAgIGNvbnN0IHhfb3NzX3Byb2Nlc3MgPSAocXVlcnlbJ3gtb3NzLXByb2Nlc3MnXSBhcyBzdHJpbmcpID8/ICcnO1xuICAgIHJldHVybiB7XG4gICAgICB1cmk6IHVyaSxcbiAgICAgIGFjdGlvbnM6IHhfb3NzX3Byb2Nlc3Muc3BsaXQoJy8nKS5maWx0ZXIoeCA9PiB4KSxcbiAgICB9O1xuICB9XG4gIGNvbnN0IHN0eWxlbmFtZSA9IChwYXJ0c1sxXSA/PyAnJykudHJpbSgpO1xuICBpZiAoIXN0eWxlbmFtZSkge1xuICAgIHRocm93IG5ldyBJbnZhbGlkQXJndW1lbnQoJ0VtcHR5IHN0eWxlIG5hbWUnKTtcbiAgfVxuICByZXR1cm4ge1xuICAgIHVyaTogcGFydHNbMF0sXG4gICAgYWN0aW9uczogWydzdHlsZScsIHN0eWxlbmFtZV0sXG4gIH07XG59XG4iXX0=