const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 7070;

const server = http.createServer((req, res) => {
    console.log(`request ${req.url}`);

    // Remove query string
    const reqPath = req.url.split('?')[0];

    // Clean URL to prevent directory traversal
    const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
    let filePath = '.' + safePath;

    if (filePath === '.' || filePath === './') {
        filePath = './index.html';
    } else if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        if (fs.existsSync(path.join(filePath, 'index.html'))) {
            filePath = path.join(filePath, 'index.html');
        }
    }

    const extname = path.extname(filePath);
    let contentType = 'text/html';
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.wav': 'audio/wav',
        '.mp4': 'video/mp4',
        '.woff': 'application/font-woff',
        '.ttf': 'application/font-ttf',
        '.eot': 'application/vnd.ms-fontobject',
        '.otf': 'application/font-otf',
        '.wasm': 'application/wasm'
    };

    contentType = mimeTypes[extname] || 'application/octet-stream';

    // Load .env variables
    const envPath = path.join(__dirname, '.env');
    let env = {};
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value) env[key.trim()] = value.trim();
        });
    }

    if (req.url === '/config') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            SUPABASE_URL: env.SUPABASE_URL,
            SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY
        }));
        return;
    }

    if (req.url === '/ai-summary' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const { sensorData } = JSON.parse(body);
                const prompt = `As a Disaster Response AI Assistant, analyze these sensor readings and provide a 2-sentence tactical summary for the incident commander. Mention any critical threats.
                Readings: ${JSON.stringify(sensorData)}`;

                const ollamaResponse = await fetch('http://localhost:11434/api/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: 'qwen3:8b', // Using qwen3:8b as it's available
                        prompt: prompt,
                        stream: false
                    })
                });

                const data = await ollamaResponse.json();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ summary: data.response }));
            } catch (error) {
                console.error("AI Error:", error);
                res.writeHead(500);
                res.end(JSON.stringify({ error: "AI processing failed" }));
            }
        });
        return;
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code == 'ENOENT') {
                res.writeHead(404);
                res.end('404 Not Found');
            } else {
                res.writeHead(500);
                res.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});
