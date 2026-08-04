// api/dossiers.js
// GET  /api/dossiers                → liste (admin, filtrable par ?statut=)
// GET  /api/dossiers?id=...         → un dossier par id (admin)
// GET  /api/dossiers?code=...       → statut seul, par code d'accès (client)
// POST /api/dossiers                → création d'un nouveau dossier (prospect)

const { supabaseAdmin } = require('./_lib/supabase');
const { requireAdmin } = require('./_lib/auth');
const { validateDossierPayload, passesHoneypot } = require('./_lib/validate');
const { validateScanPayload } = require('./_lib/validateScan');
const { checkRateLimit } = require('./_lib/rateLimit');

function generateCodeAcces() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans caractères ambigus (0/O, 1/I)
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `ADP-${code}`;
}

const { handlePreflight } = require('./_lib/cors');

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;

  try {
    if (req.method === 'POST') {
      // Anti-spam : un vrai prospect doit toujours recevoir un vrai code, ou une erreur
      // claire — jamais un faux code qui le redirigerait ensuite vers un dossier
      // inexistant. Seul un bot remplissant le champ honeypot est bloqué ici.
      if (!passesHoneypot(req.body)) {
        return res.status(400).json({ error: 'Votre soumission n\'a pas pu être validée. Merci de réessayer.' });
      }

      const allowed = await checkRateLimit(req, 'create-dossier', { limit: 5, windowSeconds: 3600 });
      if (!allowed) return res.status(429).json({ error: 'Trop de dossiers créés récemment, réessayez plus tard' });

      const { ok, errors, data } = validateDossierPayload(req.body);
      if (!ok) return res.status(400).json({ error: errors.join(', ') });

      // Tout ce qui touche au scan (walls/openings/dimensions/objects/annotations/
      // confidence_score/manual_corrections/export_files/photos/documents/mesures) est
      // revalidé et reconstruit ici — jamais transmis tel quel depuis le client.
      const scan = validateScanPayload(req.body);

      const code_acces = generateCodeAcces();

      const { data: dossier, error } = await supabaseAdmin
        .from('dossiers')
        .insert({
          ...data,
          code_acces,
          statut: 'Nouveau',
          scan_provider: scan.scan_provider,
          scan_version: scan.scan_version,
          device_capabilities: scan.device_capabilities,
          room_name: scan.room_name,
          walls: scan.walls,
          openings: scan.openings,
          dimensions: scan.dimensions,
          objects: scan.objects,
          annotations: scan.annotations,
          confidence_score: scan.confidence_score,
          manual_corrections: scan.manual_corrections,
          export_files: scan.export_files
        })
        .select()
        .single();

      if (error) throw error;

      if (scan.mesures.length) {
        await supabaseAdmin.from('mesures').insert(
          scan.mesures.map(m => ({
            dossier_id: dossier.id,
            libelle: m.libelle,
            valeur_cm: m.valeur_cm,
            source: scan.scan_provider
          }))
        );
      }

      if (scan.photos.length) {
        await supabaseAdmin.from('photos').insert(
          scan.photos.map(p => ({
            dossier_id: dossier.id,
            storage_path: p.storage_path,
            legende: p.legende,
            mur_id: p.mur_id,
            statut_annotation: p.statut_annotation,
            nettete_ok: p.nettete_ok
          }))
        );
      }

      if (scan.documents.length) {
        await supabaseAdmin.from('documents').insert(
          scan.documents.map(d => ({
            dossier_id: dossier.id,
            storage_path: d.storage_path,
            nom_original: d.nom_original,
            type_mime: d.type_mime
          }))
        );
      }

      await supabaseAdmin.from('historique_statuts').insert({ dossier_id: dossier.id, statut: 'Nouveau' });

      return res.status(200).json({ ok: true, code_acces });
    }

    if (req.method === 'GET') {
      const { id, code, statut } = req.query;

      if (code) {
        const { data, error } = await supabaseAdmin
          .from('dossiers')
          .select('statut')
          .eq('code_acces', code)
          .single();
        if (error || !data) return res.status(404).json({ error: 'Dossier introuvable' });
        return res.status(200).json(data);
      }

      const user = await requireAdmin(req, res);
      if (!user) return;

      if (id) {
        const { data: dossier, error } = await supabaseAdmin.from('dossiers').select('*').eq('id', id).single();
        if (error || !dossier) return res.status(404).json({ error: 'Dossier introuvable' });

        const { data: photos } = await supabaseAdmin.from('photos').select('*').eq('dossier_id', id);
        const { data: documents } = await supabaseAdmin.from('documents').select('*').eq('dossier_id', id);
        const { data: mesures } = await supabaseAdmin.from('mesures').select('*').eq('dossier_id', id);
        const { data: notes } = await supabaseAdmin
          .from('notes_privees')
          .select('*')
          .eq('dossier_id', id)
          .order('created_at', { ascending: false });

        return res.status(200).json({
          ...dossier,
          photos: photos || [],
          documents: documents || [],
          mesures: mesures || [],
          notes_historique: notes || []
        });
      }

      let query = supabaseAdmin.from('dossiers').select('*').order('created_at', { ascending: false });
      if (statut) query = query.eq('statut', statut);
      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json({ dossiers: data });
    }

    return res.status(405).json({ error: 'Méthode non autorisée' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};
