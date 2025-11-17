import express from "express";
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason
} from "@whiskeysockets/baileys";
import pino from "pino";

const app = express();
app.use(express.json());

let sock = null;
let isConnected = false;

async function connectToWhatsApp() {
  console.log("🚀 Iniciando WhatsApp (Railway SAFE MODE)...");

  const { state, saveCreds } = await useMultiFileAuthState("./baileys_auth");
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,

    // SAFE MODE
    logger: pino({ level: "silent" }),
    browser: Browsers.macOS("Safari"),
    printQRInTerminal: false,
    syncFullHistory: false,
    emitOwnEvents: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 30_000,
    keepAliveIntervalMs: 25_000,
    generateHighQualityLinkPreview: false,
    defaultQueryTimeoutMs: 0
  });

  // Guardar credenciales
  sock.ev.on("creds.update", saveCreds);

  // Manejo de conexión
  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    if (connection === "open") {
      console.log("🟢 WhatsApp conectado (Railway)");
      isConnected = true;
    }

    if (connection === "close") {
      const status = lastDisconnect?.error?.output?.statusCode;
      console.log("🔴 Conexión cerrada:", status);
      isConnected = false;

      if (status !== DisconnectReason.loggedOut && status !== 401) {
        console.log("⏳ Reintentando en 8 segundos...");
        setTimeout(connectToWhatsApp, 8000);
      }
    }
  });

  // Pedir Pairing Code después de unos segundos
  setTimeout(async () => {
    try {
      const phone = "51923880085"; // <-- PONGA AQUÍ SU NÚMERO, EJ: 51923880085
      console.log("📨 Solicitando código de emparejamiento...");

      const code = await sock.requestPairingCode(phone);

      console.log("\n=====================================");
      console.log("🔐 INGRESE ESTE CÓDIGO EN SU WHATSAPP:");
      console.log(`👉  ${code}`);
      console.log("=====================================\n");
    } catch (error) {
      console.log("❌ Error al pedir pairing code:");
      console.log(error);
    }
  }, 5000);
}

// Iniciar cliente
connectToWhatsApp();

// Endpoint de estado
app.get("/estado", (req, res) => {
  res.send(isConnected ? "🟢 Conectado" : "🟡 Conectando...");
});

// Endpoint para enviar a grupo
app.post("/enviar-grupo", async (req, res) => {
  const { grupo, mensaje } = req.body;

  if (!isConnected || !sock) {
    return res.status(503).send("❌ WhatsApp no está conectado aún");
  }

  try {
    const grupos = await sock.groupFetchAllParticipating();
    const lista = Object.values(grupos);
    const encontrado = lista.find(g => g.subject === grupo);

    if (!encontrado) {
      return res.status(404).send("❌ Grupo no encontrado");
    }

    await sock.sendMessage(encontrado.id, { text: mensaje });
    return res.send("✅ Mensaje enviado correctamente al grupo");
  } catch (e) {
    console.error(e);
    return res.status(500).send("❌ Error enviando mensaje al grupo");
  }
});

// Arrancar servidor HTTP (Railway asigna el puerto)
const PORT = process.env.PORT || 3006;
app.listen(PORT, () => {
  console.log(`🌐 API escuchando en puerto ${PORT}`);
});
