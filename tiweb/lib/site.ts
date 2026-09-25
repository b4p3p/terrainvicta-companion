/* Chi firma il companion e come contattarlo. Unico posto da cambiare. */

export const SITE = {
  author: "b4p3p",
  /* L'email e' spezzata apposta: nell'HTML e nel JavaScript non compare mai
     intera, cosi' i bot che raccolgono indirizzi non la trovano. La pagina la
     ricompone solo quando qualcuno clicca «Mostra email». Alias con +: se
     arriva spam, si filtra in un colpo solo. */
  email: ["montrone.giuseppe+ticompanion", "gmail.com"] as const,
  /** paypal.me/<nome> per le donazioni; vuoto = pulsante nascosto */
  paypal: "https://paypal.me/b4p3p",
  /** pulsanti delle donazioni: paypal.me accetta l'importo nel link
   *  (/3EUR), chi dona lo trova gia' scritto e puo' cambiarlo; null = libero */
  donations: [
    { key: "coffee", amount: 3 },
    { key: "pizza", amount: 10 },
    { key: "project", amount: null },
  ] as const,
};

export const donationUrl = (amount: number | null) =>
  amount ? `${SITE.paypal}/${amount}EUR` : SITE.paypal;

export const siteEmail = () => SITE.email.join("@");
