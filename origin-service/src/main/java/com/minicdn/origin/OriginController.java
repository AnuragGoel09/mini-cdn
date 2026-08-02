package com.minicdn.origin;

import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.io.IOException;
import java.io.InputStream;
import java.net.URISyntaxException;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Source-of-truth file server. Every read recomputes the ETag from the
 * current file bytes (a short SHA-256 digest), so editing a file on disk
 * automatically changes its ETag and busts downstream caches on next fetch.
 */
@RestController
public class OriginController {

    private static final String FILES_DIR = "files";

    @GetMapping("/files")
    public List<String> listFiles() throws IOException, URISyntaxException {
        URL dirUrl = getClass().getClassLoader().getResource(FILES_DIR);
        if (dirUrl == null) {
            return List.of();
        }
        Path dirPath = Paths.get(dirUrl.toURI());
        try (Stream<Path> paths = Files.list(dirPath)) {
            return paths.filter(Files::isRegularFile)
                    .map(p -> p.getFileName().toString())
                    .sorted()
                    .collect(Collectors.toList());
        }
    }

    @GetMapping("/files/{name}")
    public ResponseEntity<byte[]> getFile(@PathVariable String name) throws IOException {
        byte[] bytes = readFileBytes(name);
        String etag = sha256Short(bytes);
        return ResponseEntity.ok()
                .header(HttpHeaders.ETAG, etag)
                .header("X-Size-Bytes", String.valueOf(bytes.length))
                .contentType(guessContentType(name))
                .body(bytes);
    }

    @GetMapping("/files/{name}/meta")
    public FileMeta getMeta(@PathVariable String name) throws IOException {
        byte[] bytes = readFileBytes(name);
        return new FileMeta(name, sha256Short(bytes), bytes.length);
    }

    private byte[] readFileBytes(String name) throws IOException {
        // guard against path traversal
        if (name.contains("..") || name.contains("/") || name.contains("\\")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid file name");
        }
        ClassPathResource resource = new ClassPathResource(FILES_DIR + "/" + name);
        if (!resource.exists()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "file not found: " + name);
        }
        try (InputStream in = resource.getInputStream()) {
            return in.readAllBytes();
        }
    }

    private MediaType guessContentType(String name) {
        String lower = name.toLowerCase();
        if (lower.endsWith(".png")) return MediaType.IMAGE_PNG;
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return MediaType.IMAGE_JPEG;
        if (lower.endsWith(".json")) return MediaType.APPLICATION_JSON;
        if (lower.endsWith(".html")) return MediaType.TEXT_HTML;
        if (lower.endsWith(".css")) return MediaType.valueOf("text/css");
        if (lower.endsWith(".js")) return MediaType.valueOf("application/javascript");
        return MediaType.TEXT_PLAIN;
    }

    private String sha256Short(byte[] content) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(content);
            // short 16-char hex prefix is plenty of entropy for a demo ETag
            return "\"" + HexFormat.of().formatHex(hash).substring(0, 16) + "\"";
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    public record FileMeta(String name, String etag, long sizeBytes) {}
}
