"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const find_up_1 = __importDefault(require("find-up"));
const locate_path_1 = __importDefault(require("locate-path"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const util_1 = __importDefault(require("util"));
const ignore_1 = __importDefault(require("ignore"));
const cross_spawn_1 = __importDefault(require("cross-spawn"));
let readFile = util_1.default.promisify(fs_1.default.readFile);
/**
 * Parse a CODEOWNERS file into an array of entries (will be in reverse order
 * of the file).
 */
function parse(str) {
    let entries = [];
    let lines = str.split("\n");
    lines.forEach((entry, idx) => {
        let [content, comment] = entry.split("#");
        let trimmed = content.trim();
        if (trimmed === "")
            return;
        let [pattern, ...owners] = trimmed.split(/\s+/);
        let line = idx + 1;
        entries.push({ pattern, owners, line });
    });
    return entries.reverse();
}
exports.parse = parse;
/**
 * Standard locations to search for the CODEOWNERS file in priority order
 * (Note: This comes from GitHub).
 */
exports.CODEOWNERS_PATHS = [
    ".github/CODEOWNERS",
    "docs/CODEOWNERS",
    "CODEOWNERS",
];
/**
 * Find the path of the CODEOWNERS file from the current working directory.
 */
async function findOwnersPath(cwd) {
    let git = await find_up_1.default(".git/", { cwd });
    if (!git)
        return null;
    let root = path_1.default.dirname(git);
    let paths = exports.CODEOWNERS_PATHS.map(part => path_1.default.join(root, part));
    let codeowners = await locate_path_1.default(paths, { cwd });
    return codeowners || null;
}
exports.findOwnersPath = findOwnersPath;
/**
 * Find, load, and parse the CODEOWNERS file (if it exists) from the current
 * working directory.
 */
async function loadOwners(cwd) {
    let file = await findOwnersPath(cwd);
    if (!file)
        return null;
    let contents = await readFile(file, "utf-8");
    let entries = parse(contents);
    return entries;
}
exports.loadOwners = loadOwners;
/**
 * Match a filename against a glob pattern (while respecting .gitignore rules)
 */
function matchPattern(filename, pattern) {
    return ignore_1.default()
        .add(pattern)
        .ignores(filename);
}
exports.matchPattern = matchPattern;
/**
 * Match a filename against CODEOWNERS entries to determine which (if any) it
 * matches.
 */
function matchFile(filename, entries) {
    for (let entry of entries) {
        if (matchPattern(filename, entry.pattern)) {
            return entry;
        }
    }
    return null;
}
exports.matchFile = matchFile;
/**
 * Given a set of files and CODEOWNERS entries, return the set of files which
 * are not matched to any CODEOWNERS entries.
 */
function filterUnmatchedFiles(files, entries) {
    return files.filter(file => !matchFile(file, entries));
}
exports.filterUnmatchedFiles = filterUnmatchedFiles;
/**
 * Spawn a child process and convert it into a promise.
 * @internal
 */
function spawn(cmd, args, opts, onData) {
    return new Promise((resolve, reject) => {
        let proc = cross_spawn_1.default(cmd, args, opts);
        proc.stdout.on("data", onData);
        proc.on("error", reject);
        proc.on("close", code => {
            if (code !== 0) {
                reject(new Error(`"${cmd} ${args.join(" ")}" exited with non-zero exit code: ${code}`)); // prettier-ignore
            }
            else {
                resolve();
            }
        });
    });
}
/**
 * Use git to list all files in a repository.
 * @internal
 */
async function lsFiles(cwd, onFiles) {
    await spawn("git", ["ls-files", "--others", "--exclude-standard"], { cwd, stdio: ["ignore", "pipe", "inherit"] }, data => {
        let files = data
            .toString()
            .trim()
            .split("\n");
        onFiles(files);
    });
}
/**
 * Find all of the files in a git repository which are not matched by any code
 * owners using a set of CODEOWNERS entries.
 */
async function findUnmatchedFilesFromEntries(entries, cwd) {
    let unmatched = [];
    await lsFiles(cwd, files => {
        unmatched = unmatched.concat(filterUnmatchedFiles(files, entries));
    });
    return unmatched;
}
exports.findUnmatchedFilesFromEntries = findUnmatchedFilesFromEntries;
/**
 * Find all of the files in a git repository which are not matched by any code
 * owners.
 */
async function findUnmatchedFiles(cwd) {
    let entries = await loadOwners(cwd);
    if (!entries)
        return null;
    let unmatched = await findUnmatchedFilesFromEntries(entries, cwd);
    return unmatched;
}
exports.findUnmatchedFiles = findUnmatchedFiles;
//# sourceMappingURL=codeowners-utils.js.map