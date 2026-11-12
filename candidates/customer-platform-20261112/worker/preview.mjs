// Browser-side passive renderer. Opaque iframe origin + no scripts + no network.
export const PREVIEW_CSP="default-src 'none'; script-src 'none'; connect-src 'none'; style-src 'unsafe-inline'; img-src 'none'; media-src 'none'; font-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; navigate-to 'none'";
const ALLOWED=new Set('html head body title style main header footer section article aside nav div p span h1 h2 h3 h4 h5 h6 ul ol li dl dt dd table thead tbody tfoot tr th td caption colgroup col br hr strong em b i u s small blockquote pre code a button details summary figure figcaption'.split(' '));
const GLOBAL=new Set(['class','id','style','title','lang','dir','role','aria-label','aria-hidden']);
export function createPassivePreview(artifact,{Parser=globalThis.DOMParser}={}){
 if(typeof Parser!=='function')throw Error('browser_parser_required');
 if(!artifact?.files?.length)throw Error('missing_artifact');
 const html=artifact.files.find(f=>f.path==='index.html')?.content;
 if(typeof html!=='string'||html.length>64000)throw Error('invalid_preview');
 const input=new Parser().parseFromString(html,'text/html');
 const output=document.implementation.createHTMLDocument('SOLQ 격리 미리보기');
 let removedElements=0,removedAttributes=0;
 function copy(node,parent){
  if(node.nodeType===3){parent.append(output.createTextNode(node.textContent));return;}
  if(node.nodeType!==1)return;
  const tag=node.localName.toLowerCase();
  if(!ALLOWED.has(tag)){removedElements++;return;}
  if(['html','head','body'].includes(tag)){for(const child of node.childNodes)copy(child,parent);return;}
  const clean=output.createElement(tag);
  for(const attr of node.attributes){const name=attr.name.toLowerCase();if(GLOBAL.has(name)||(tag==='td'||tag==='th')&&['colspan','rowspan'].includes(name)){clean.setAttribute(name,attr.value);}else removedAttributes++;}
  if(tag==='button')clean.setAttribute('type','button');
  for(const child of node.childNodes)copy(child,clean);
  parent.append(clean);
 }
 for(const child of input.head.childNodes)copy(child,output.head);
 for(const child of input.body.childNodes)copy(child,output.body);
 for(const file of artifact.files.filter(f=>f.path.endsWith('.css'))){if(typeof file.content!=='string'||file.content.length>40000)throw Error('invalid_stylesheet');const css=output.createElement('style');css.textContent=file.content.replace(/</g,'\\3c ');output.head.append(css);}
 const charset=output.createElement('meta');charset.setAttribute('charset','utf-8');output.head.prepend(charset);
 const policy=output.createElement('meta');policy.httpEquiv='Content-Security-Policy';policy.content=PREVIEW_CSP;output.head.prepend(policy);
 const viewport=output.createElement('meta');viewport.name='viewport';viewport.content='width=device-width,initial-scale=1';output.head.append(viewport);
 return {html:'<!doctype html>'+output.documentElement.outerHTML,validation:{mode:'passive_dom_allowlist',scriptsExecuted:false,networkAllowed:false,formsAllowed:false,navigationLinksRemoved:true,removedElements,removedAttributes,interactiveBehaviorTested:false}};
}
export function mountPassivePreview(frame,artifact){
 if(!frame||frame.localName!=='iframe')throw Error('iframe_required');
 const compiled=createPassivePreview(artifact);
 frame.setAttribute('sandbox',''); // Never allow-scripts or allow-same-origin.
 frame.setAttribute('referrerpolicy','no-referrer');
 frame.setAttribute('allow',"camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'");
 frame.srcdoc=compiled.html;
 return compiled.validation;
}
