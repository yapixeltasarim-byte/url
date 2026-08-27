'use strict';

// WhatsApp'in onizleme sunucusu bir baglanti kanala dustugu anda URL'yi ceker;
// filtrelenmezse henuz kimse tiklamamisken sayac calismaya baslar (bkz. Bolum 9.1).
const BOT_PATTERN = /whatsapp|bot|crawl|spider|preview|facebookexternalhit|slackbot|telegrambot|twitterbot|linkedinbot|discordbot|skypeuripreview/i;

function isBotUserAgent(userAgent) {
  if (!userAgent) return true; // user-agent yok = tarayici degil, guvenli taraf
  return BOT_PATTERN.test(userAgent);
}

module.exports = { isBotUserAgent };
