// A API de Product Ads do Brasil não documenta escrita: o ML responde 401 "User does not
// have permission to write" mesmo com o escopo ads read-write. Os botões que alteram e criam
// campanhas ficam desligados até o ML liberar; ADS_WRITE_ENABLED=true liga de novo.
export function adsWriteEnabled() {
  return process.env.ADS_WRITE_ENABLED === "true";
}
