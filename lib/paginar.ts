/** Uma falha em qualquer página invalida o conjunto, em vez de publicar um resultado parcial. */
export async function lerPaginas<T>(consultar:(inicio:number,fim:number)=>PromiseLike<{data:T[]|null;error:{message:string}|null}>,tamanho=1000):Promise<T[]> {
  const rows:T[]=[];
  for(let inicio=0;;inicio+=tamanho){
    const {data,error}=await consultar(inicio,inicio+tamanho-1);
    if(error) throw new Error(error.message);
    if(!data) throw new Error("A consulta não retornou os dados solicitados.");
    rows.push(...data); if(data.length<tamanho) return rows;
  }
}
