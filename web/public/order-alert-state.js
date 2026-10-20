export function unseenOrderIds(previous,orders){
  if(previous===null)return [];
  return orders.filter(o=>o.status==='Received'&&!previous.has(o.id)).map(o=>o.id);
}
