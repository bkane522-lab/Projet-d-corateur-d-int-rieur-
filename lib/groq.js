// api/_lib/groq.js
// Toute la logique IA passe par ce helper, exclusivement côté serveur.
// Garde-fous stricts, rappelés dans chaque appel : l'IA ne diagnostique jamais la
// structure d'un bâtiment et n'invente jamais une dimension non fournie.

const SYSTEM_GUARDRAILS = `Tu assistes une décoratrice d'intérieur humaine. Règles strictes,
non négociables :
- Tu ne dois JAMAIS inventer une dimension, une mesure ou une donnée qui n'est pas fournie
  explicitement dans les informations du dossier.
- Tu ne dois JAMAIS identifier ou supposer qu'un mur est porteur ou non porteur : c'est une
  question qui exige une expertise structurelle humaine sur site.
- Tu ne dois JAMAIS produire un diagnostic structurel ou technique du bâtiment.
- Tu ne dois JAMAIS présenter un plan ou une mesure comme "certifié" ou "validé
  techniquement" : toutes les données issues du client restent indicatives jusqu'à
  validation par la décoratrice.
- Tu ne remplaces jamais la décision ou la validation de la décoratrice ; tu l'assistes.
Si une information demandée nécessiterait de deviner ou d'extrapoler au-delà de ce qui est
fourni, dis explicitement que l'information est manquante plutôt que de l'inventer.`;

async function callGroq(userPrompt, { maxTokens = 500, temperature = 0.4 } = {}) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY manquante');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_GUARDRAILS },
        { role: 'user', content: userPrompt }
      ],
      temperature,
      max_tokens: maxTokens
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erreur Groq (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

module.exports = { callGroq, SYSTEM_GUARDRAILS };
