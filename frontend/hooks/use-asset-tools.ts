'use client';
import {useEffect,useRef} from 'react';import {Asset} from '@/shared/domain';
export function useAssetTools(assets:Asset[],open:(kind:string,data:Record<string,unknown>)=>void){
 const ref=useRef({assets,open});ref.current={assets,open};
 useEffect(()=>{const context=(document as Document&{modelContext?:any}).modelContext;if(!context?.registerTool)return;
 const life=new AbortController();const register=(tool:any)=>{try{Promise.resolve(context.registerTool(tool,{signal:life.signal})).catch(()=>{});}catch{}};
 register({name:'search_asset_register',title:'ค้นหาทะเบียนครุภัณฑ์',description:'Read matching active asset records from the visible register.',inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query'],additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input:unknown){const q=(input as {query?:unknown})?.query;if(typeof q!=='string'||q.length>300)throw Error('Invalid query');return ref.current.assets.filter(a=>a.lifecycle==='active'&&(a.name+' '+a.code+' '+a.serial).toLowerCase().includes(q.toLowerCase())).slice(0,30).map(a=>({id:a.id,code:a.code,name:a.name,quantity:a.quantity,totalSatang:a.totalSatang,condition:a.condition}));}});
 register({name:'start_asset_lot_split',title:'เปิดแบบฟอร์มแบ่งล็อต',description:'Open the existing split-lot review form for an active asset. Does not save or split the asset.',inputSchema:{type:'object',properties:{assetId:{type:'string'}},required:['assetId'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input:unknown){const id=(input as {assetId?:unknown})?.assetId;if(typeof id!=='string')throw Error('Invalid assetId');const a=ref.current.assets.find(a=>a.id===id&&a.lifecycle==='active'&&a.quantity>1);if(!a)throw Error('Asset cannot be split');ref.current.open('split',{asset:a});return {opened:true,assetId:a.id,requiresConfirmation:true};}});
 return()=>life.abort();},[]);
}

