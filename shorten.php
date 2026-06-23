<?php
/**
 * Server-side proxy for the Finnovate link shortener.
 *
 * The browser (utmbuilder.html) POSTs url/title/tags/folder here; this script
 * adds the secret API key and forwards the request to the shortener API, so the
 * key is never exposed in client-side code. Same-origin call -> no CORS needed.
 *
 * The key lives in .shortener-config.php (gitignored + blocked by .htaccess).
 */
// Never let PHP notices/warnings pollute the JSON response.
ini_set('display_errors', '0');

header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

$cfgFile = __DIR__ . '/.shortener-config.php';
if (!is_file($cfgFile)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Shortener not configured on the server.']);
    exit;
}
$cfg = require $cfgFile;
$apiKey   = (string) ($cfg['key'] ?? '');
$endpoint = (string) ($cfg['endpoint'] ?? 'https://team.finnovate.in/s/api.php');

$url = trim((string) ($_POST['url'] ?? ''));
if ($url === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing url']);
    exit;
}

// Whitelist the fields we forward.
$payload = ['url' => $url];
foreach (['slug', 'title', 'tags', 'folder'] as $k) {
    if (isset($_POST[$k]) && $_POST[$k] !== '') {
        $payload[$k] = $_POST[$k];
    }
}
$post = http_build_query($payload);

$resp = false;
$code = 0;

if (function_exists('curl_init')) {
    $ch = curl_init($endpoint);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $post,
        CURLOPT_HTTPHEADER     => ['X-API-Key: ' . $apiKey, 'Content-Type: application/x-www-form-urlencoded'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
    ]);
    $resp = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
}

// Fallback if curl is unavailable or failed.
if ($resp === false) {
    $ctx = stream_context_create(['http' => [
        'method'        => 'POST',
        'header'        => "Content-Type: application/x-www-form-urlencoded\r\nX-API-Key: $apiKey\r\n",
        'content'       => $post,
        'timeout'       => 15,
        'ignore_errors' => true,
    ]]);
    $resp = @file_get_contents($endpoint, false, $ctx);
    $code = 200; // the JSON body already carries success/error
}

if ($resp === false) {
    http_response_code(502);
    echo json_encode(['success' => false, 'error' => 'Could not reach the shortener.']);
    exit;
}

http_response_code($code ?: 200);
echo $resp;
