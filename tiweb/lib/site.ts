/* Chi firma il companion e come contattarlo. Unico posto da cambiare. */

export const SITE = {
  author: "b4p3p",
  /* L'email e' spezzata apposta: nell'HTML e nel JavaScript non compare mai
     intera, cosi' i bot che raccolgono indirizzi non la trovano. La pagina la
     ricompone solo quando qualcuno clicca «Mostra email». Alias con +: se
     arriva spam, si filtra in un colpo solo. */
  email: ["montrone.giuseppe+ticompanion", "gmail.com"] as const,
  /** paypal.me/<nome> per le donazioni; vuoto = pulsante nascosto */
  paypal: "",
};

export const siteEmail = () => SITE.email.join("@");
