const express = require('express');
const fs = require('fs');

const Documento = require('../models/Documento');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { inviaDipendente, escTG } = require('../utils/telegram');
const { uploaderFor } = require('../utils/upload');

const router = express.Router();
const upload = uploaderFor('documenti');

const CAT_LABEL = { busta_paga: 'busta paga', cu: 'CU', contratto: 'contratto', altro: 'documento' };
const MESI = ['', 'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

router.get('/', requireAuth, async (req, res) => {
  const { dipendente_id, categoria, mese, anno } = req.query;
  const filtro = {};
  if (req.user.ruolo === 'admin') {
    if (dipendente_id) filtro.dipendente_id = dipendente_id;
  } else {
    filtro.dipendente_id = req.user.id;
  }
  if (categoria) filtro.categoria = categoria;
  if (mese) filtro.mese = parseInt(mese, 10);
  if (anno) filtro.anno = parseInt(anno, 10);
  res.json(await Documento.find(filtro).sort({ anno: -1, mese: -1 }));
});

// Admin: carica un documento per un dipendente.
router.post('/', requireAuth, requireAdmin, upload.single('file'), async (req, res) => {
  const { dipendente_id, categoria, descrizione, anno, mese } = req.body || {};
  if (!dipendente_id || !req.file) return res.status(400).json({ error: 'Dipendente e file sono obbligatori' });
  if ((categoria === 'busta_paga' || categoria === 'cu') && !mese) {
    return res.status(400).json({ error: 'Il mese è obbligatorio per buste paga e CU' });
  }
  const documento = await Documento.create({
    dipendente_id,
    categoria: categoria || 'altro',
    nome_file: req.file.originalname,
    descrizione: descrizione || undefined,
    url: req.file.path,
    anno: anno ? parseInt(anno, 10) : undefined,
    mese: mese ? parseInt(mese, 10) : undefined,
    caricato_da: req.user.id,
  });

  const periodo = [anno, mese ? MESI[parseInt(mese, 10)] : null].filter(Boolean).join(' ');
  await inviaDipendente(
    dipendente_id,
    `<b>Nuovo documento disponibile</b>\n\nÈ disponibile un nuovo ${CAT_LABEL[categoria] || categoria}${periodo ? ' (' + periodo + ')' : ''}.${descrizione ? '\n' + escTG(descrizione) : ''}`,
    '#docs'
  );

  res.status(201).json(documento);
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const documento = await Documento.findById(req.params.id);
  if (!documento) return res.status(404).json({ error: 'Documento non trovato' });
  if (fs.existsSync(documento.url)) fs.unlinkSync(documento.url);
  await documento.deleteOne();
  res.json({ ok: true });
});

// Apre/scarica il file — segna automaticamente come letto se è busta paga/CU
// (equivalente alla conferma di lettura dell'app originale).
router.get('/:id/file', requireAuth, async (req, res) => {
  const documento = await Documento.findById(req.params.id);
  if (!documento) return res.status(404).json({ error: 'Documento non trovato' });
  if (req.user.ruolo !== 'admin' && documento.dipendente_id.toString() !== req.user.id) {
    return res.status(403).json({ error: 'Non autorizzato' });
  }
  if (!fs.existsSync(documento.url)) return res.status(404).json({ error: 'File non trovato su disco' });

  if (req.user.ruolo !== 'admin' && ['busta_paga', 'cu'].includes(documento.categoria) && !documento.letto_il) {
    documento.letto_dip = true;
    documento.letto_il = new Date();
    await documento.save();
  }

  res.download(documento.url, documento.nome_file);
});

module.exports = router;
