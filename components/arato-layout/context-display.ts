/** Presentation only: the Arato account/producer identity remains unchanged. */
export function contextClient(client:string,producer:string){return client.trim()||producer.trim()||'Cliente não identificado';}
export function contextSeason(season:string){return season.trim().replace(/^(?:ano[\s-]*safra|safra)\s*:?\s*/i,'')||'Não informado';}
