// weekender studio — moteur de rendu WebGL2 et catalogue d'effets.
// Convention : la ligne 0 d'une texture est le haut de l'image ; seule la copie
// finale vers le canvas retourne l'axe Y. Toutes les longueurs sont exprimées
// en fraction du grand côté (u_unit) pour que l'export pleine résolution
// corresponde à l'aperçu.

const VERT = `#version 300 es
in vec2 a; out vec2 v_uv; uniform float u_flip;
void main(){ v_uv=a*0.5+0.5; if(u_flip>0.5) v_uv.y=1.0-v_uv.y; gl_Position=vec4(a,0.0,1.0); }`;

const HEAD = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform sampler2D u_src; uniform vec2 u_res; uniform float u_unit;
const float PI=3.14159265;
float hash(vec2 p){ uvec2 q=uvec2(ivec2(floor(p))); uint n=q.x*1597334673u^q.y*3812015801u;
  n=(n^(n>>15))*2246822519u; n^=n>>13; n*=3266489917u; n^=n>>16; return float(n)*(1.0/4294967295.0); }
float ign(vec2 p){ return fract(52.9829189*fract(dot(p,vec2(0.06711056,0.00583715)))); }
float luma(vec3 c){ return dot(c,vec3(0.2126,0.7152,0.0722)); }
float vn(vec2 p,float s){ p+=vec2(s*131.0,s*57.0); vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
vec3 grainN(vec2 px,float size,float col){ vec2 p=px/max(size*u_unit/2400.0,0.35);
  float m=vn(p,0.0)+vn(p*1.63+9.1,1.0)-1.0;
  vec3 c=vec3(vn(p,2.0)+vn(p*1.63+9.1,3.0),vn(p,4.0)+vn(p*1.63+9.1,5.0),vn(p,6.0)+vn(p*1.63+9.1,7.0))-1.0;
  return mix(vec3(m),c,col)*1.6; }
vec3 addGrain(vec3 c,vec2 px,float amt,float size,float col){ float l=luma(clamp(c,0.0,1.0));
  float w=1.0-0.65*(2.0*l-1.0)*(2.0*l-1.0); return c+grainN(px,size,col)*amt*w; }
float vig(vec2 uv,float amt){ vec2 p=(uv-0.5)*u_res/u_unit; float d=dot(p,p)*2.0; return 1.0-amt*smoothstep(0.05,1.0,d); }
`;

const S = {};
S.copy = `void main(){ o=texture(u_src,v_uv); }`;
S.crop = `uniform vec2 u_off,u_scale; void main(){ o=vec4(texture(u_src,u_off+v_uv*u_scale).rgb,1.0); }`;
S.blit = `void main(){ vec3 c=texture(u_src,v_uv).rgb; c+=(ign(gl_FragCoord.xy)-0.5)/255.0; o=vec4(clamp(c,0.0,1.0),1.0); }`;

S.mix = `uniform sampler2D u_fx; uniform float u_op,u_zone,u_zpos,u_zfe; uniform vec2 u_pt;
void main(){ vec3 a=texture(u_src,v_uv).rgb,b=texture(u_fx,v_uv).rgb; float m=1.0; float f=max(u_zfe,0.0015);
  if(u_zone==1.0) m=1.0-smoothstep(u_zpos-f,u_zpos+f,v_uv.x);
  else if(u_zone==2.0) m=smoothstep(u_zpos-f,u_zpos+f,v_uv.x);
  else if(u_zone==3.0) m=1.0-smoothstep(u_zpos-f,u_zpos+f,v_uv.y);
  else if(u_zone==4.0) m=smoothstep(u_zpos-f,u_zpos+f,v_uv.y);
  else if(u_zone>=5.0){ float d=length((v_uv-u_pt)*u_res)/u_unit; float r=u_zpos*0.7;
    m=1.0-smoothstep(r-f,r+f,d); if(u_zone==6.0) m=1.0-m; }
  o=vec4(mix(a,b,m*u_op),1.0); }`;

S.motion = `uniform float u_len,u_angle,u_trail,u_jit;
void main(){ vec2 d=vec2(cos(u_angle),sin(u_angle))*u_len*u_unit/u_res; float j=(ign(gl_FragCoord.xy)-0.5)*u_jit;
  vec3 acc=vec3(0.0); float ws=0.0;
  for(int i=0;i<32;i++){ float t=(float(i)+0.5+j)/32.0; float s=mix(t-0.5,-t,u_trail);
    float w=mix(1.0,pow(1.0-t,1.6)+0.03,u_trail); vec3 c=texture(u_src,v_uv+d*s).rgb; acc+=c*c*w; ws+=w; }
  o=vec4(sqrt(acc/ws),1.0); }`;
S.flash = `uniform sampler2D u_sharp; uniform float u_f;
void main(){ vec3 b=texture(u_src,v_uv).rgb,s=texture(u_sharp,v_uv).rgb;
  vec3 c=mix(b,s,u_f*0.45); c=mix(c,max(c,s),u_f*0.6); o=vec4(c,1.0); }`;

S.smear = `uniform float u_len,u_angle,u_band,u_irr,u_lines;
float n1(float x,float s){ float i=floor(x),f=fract(x); f=f*f*(3.0-2.0*f); return mix(hash(vec2(i,s)),hash(vec2(i+1.0,s)),f); }
void main(){ vec2 dir=vec2(cos(u_angle),sin(u_angle)); vec2 nrm=vec2(-dir.y,dir.x); vec2 px=v_uv*u_res;
  float v=dot(px,nrm)/u_unit; float b=n1(v/u_band,7.0)*0.62+n1(v/u_band*3.7+11.0,9.0)*0.38;
  float line=hash(vec2(floor(v*520.0),3.0));
  float amp=mix(1.0,smoothstep(0.25,0.8,b)*(0.55+0.9*line),u_irr);
  vec2 d=dir*u_len*amp*u_unit/u_res; float j=ign(gl_FragCoord.xy)-0.5;
  vec3 acc=vec3(0.0); float ws=0.0;
  for(int i=0;i<32;i++){ float t=(float(i)+0.5+j)/32.0; float w=pow(1.0-t,1.2)+0.04;
    vec3 c=texture(u_src,v_uv-d*t).rgb; acc+=c*c*w; ws+=w; }
  vec3 c=sqrt(acc/ws); vec3 s=texture(u_src,v_uv).rgb;
  float moved=clamp(length(c-s)*4.0,0.0,1.0)*clamp(amp*u_len*30.0,0.0,1.0);
  c*=1.0-u_lines*0.45*moved*(hash(vec2(floor(v*900.0),5.0))-0.2);
  o=vec4(c,1.0); }`;

S.ghost = `uniform float u_count,u_dist,u_angle,u_scale,u_rot,u_decay,u_mode,u_tint;
void main(){ vec2 dir=vec2(cos(u_angle),sin(u_angle)); vec3 acc=vec3(0.0); float ws=0.0;
  vec3 base=texture(u_src,v_uv).rgb; if(u_mode==1.0||u_mode==2.0) acc=vec3(0.0); if(u_mode==3.0) acc=vec3(1.0);
  for(int i=0;i<8;i++){ float k=float(i); if(k>=u_count) break;
    vec2 p=(v_uv-0.5)*u_res; p-=dir*u_dist*u_unit*k; float a=-u_rot*k; p=mat2(cos(a),-sin(a),sin(a),cos(a))*p;
    p/=pow(u_scale,k); vec2 uv=p/u_res+0.5;
    vec2 e=smoothstep(vec2(0.0),vec2(0.02),uv)*smoothstep(vec2(0.0),vec2(0.02),1.0-uv);
    float w=pow(u_decay,k)*e.x*e.y; vec3 c=texture(u_src,uv).rgb; vec3 tc=0.5+0.5*cos(6.2831853*(k*0.23+vec3(0.0,0.33,0.67))); c=mix(c,vec3(luma(c))*tc*1.8,u_tint*step(0.5,k));
    if(u_mode==0.0){ acc+=c*c*w; ws+=w; }
    else if(u_mode==1.0) acc=max(acc,c*w);
    else if(u_mode==2.0) acc=1.0-(1.0-acc)*(1.0-c*w);
    else acc=min(acc,mix(k==0.0?vec3(1.0):base,c,w)); }
  if(u_mode==0.0) acc=sqrt(acc/max(ws,0.001));
  o=vec4(acc,1.0); }`;

S.prism = `uniform float u_facets,u_amount,u_disp,u_soft,u_rot,u_type,u_core; uniform vec2 u_pt;
vec2 fdir(float id){ if(u_type==0.0){ float a=(id+0.5)/u_facets*2.0*PI-u_rot; return vec2(cos(a),sin(a)); }
  vec2 d=vec2(cos(u_rot),sin(u_rot)); return d*(hash(vec2(id,13.0))*2.0-1.0)*1.4; }
vec3 facet(float id){ vec2 off=fdir(id)*u_amount*u_unit/u_res;
  return vec3(texture(u_src,v_uv-off*(1.0+u_disp)).r,texture(u_src,v_uv-off).g,texture(u_src,v_uv-off*(1.0-u_disp)).b); }
void main(){ vec2 p=(v_uv-u_pt)*u_res/u_unit; float f;
  if(u_type==0.0) f=(atan(p.y,p.x)+u_rot)/(2.0*PI)*u_facets; else f=dot(p,vec2(cos(u_rot),sin(u_rot)))*u_facets*1.2;
  float id=floor(f),fr=fract(f),e=fr-0.5; float nb=id+sign(e);
  float w=smoothstep(0.5-u_soft*0.5,0.5,abs(e))*0.5;
  vec3 c=mix(facet(id),facet(nb),w);
  if(u_type==0.0){ float r=length(p); c=mix(texture(u_src,v_uv).rgb,c,smoothstep(u_core*0.6,u_core*0.6+0.06+u_soft*0.1,r)); }
  o=vec4(c,1.0); }`;

S.zoom = `uniform float u_amt,u_type; uniform vec2 u_pt;
void main(){ float j=ign(gl_FragCoord.xy)-0.5; vec3 acc=vec3(0.0);
  for(int i=0;i<32;i++){ float t=(float(i)+0.5+j)/32.0-0.5; vec2 p=(v_uv-u_pt)*u_res;
    if(u_type==0.0) p*=1.0+u_amt*t; else { float a=u_amt*t; p=mat2(cos(a),-sin(a),sin(a),cos(a))*p; }
    vec3 c=texture(u_src,p/u_res+u_pt).rgb; acc+=c*c; }
  o=vec4(sqrt(acc/32.0),1.0); }`;

S.gauss = `uniform vec2 u_d; uniform float u_sigma;
void main(){ vec3 acc=vec3(0.0); float ws=0.0; float s2=2.0*max(u_sigma*u_sigma,0.01);
  for(int i=-10;i<=10;i++){ float x=float(i); float w=exp(-x*x/s2); vec3 c=texture(u_src,v_uv+u_d*x/u_res).rgb; acc+=c*c*w; ws+=w; }
  o=vec4(sqrt(acc/ws),1.0); }`;

S.bright = `uniform float u_thr,u_px,u_luma;
void main(){ vec2 d=u_px/u_res*0.25; vec3 c=max(max(texture(u_src,v_uv+d*vec2(-1,-1)).rgb,texture(u_src,v_uv+d*vec2(1,-1)).rgb),
    max(texture(u_src,v_uv+d*vec2(-1,1)).rgb,texture(u_src,v_uv+d*vec2(1,1)).rgb));
  float l=mix(max(c.r,max(c.g,c.b)),luma(c),u_luma); float k=smoothstep(u_thr,min(u_thr+0.12,1.0)+0.001,l); o=vec4(c*k,1.0); }`;

S.glowmix = `uniform sampler2D u_glow; uniform float u_int; uniform vec3 u_tint;
void main(){ vec3 c=texture(u_src,v_uv).rgb; vec3 g=texture(u_glow,v_uv).rgb*u_tint*u_int;
  o=vec4(1.0-(1.0-c)*(1.0-clamp(g,0.0,1.0)),1.0); }`;

S.chroma = `uniform float u_amt,u_type,u_angle;
void main(){ vec2 d; if(u_type==0.0) d=(v_uv-0.5)*u_amt*2.0; else d=vec2(cos(u_angle),sin(u_angle))*u_amt*u_unit/u_res;
  vec3 acc=vec3(0.0),ws=vec3(0.0);
  for(int i=0;i<9;i++){ float t=float(i)/8.0*2.0-1.0; vec3 w=max(vec3(1.0-abs(t-0.8),1.0-abs(t),1.0-abs(t+0.8)),0.0);
    acc+=texture(u_src,v_uv+d*t).rgb*w; ws+=w; }
  o=vec4(acc/ws,1.0); }`;

S.duotone = `uniform vec3 u_a,u_b; uniform float u_con,u_bri;
void main(){ float l=luma(texture(u_src,v_uv).rgb); l=clamp((l-0.5)*(1.0+u_con)+0.5+u_bri,0.0,1.0);
  o=vec4(sqrt(mix(u_a*u_a,u_b*u_b,l)),1.0); }`;

S.gel = `uniform vec3 u_a,u_b; uniform float u_angle,u_spread,u_pos,u_mode,u_int;
vec3 soft(vec3 b,vec3 s){ return mix(2.0*b*s+b*b*(1.0-2.0*s),sqrt(b)*(2.0*s-1.0)+2.0*b*(1.0-s),step(0.5,s)); }
void main(){ vec3 c=clamp(texture(u_src,v_uv).rgb,0.0,1.0); vec2 p=(v_uv-0.5)*u_res/u_unit;
  float t=dot(p,vec2(cos(u_angle),sin(u_angle)))/max(u_spread,0.02)+0.5+u_pos; vec3 g=mix(u_a,u_b,smoothstep(0.0,1.0,t));
  vec3 r; float l=luma(c);
  if(u_mode==0.0) r=pow(l,0.85)*g*1.55;
  else if(u_mode==1.0) r=soft(c,g);
  else if(u_mode==2.0) r=1.0-(1.0-c)*(1.0-g*0.8);
  else if(u_mode==3.0) r=c*g*1.25;
  else r=mix(2.0*c*g,1.0-2.0*(1.0-c)*(1.0-g),step(0.5,c));
  o=vec4(mix(c,r,u_int),1.0); }`;

S.tone = `uniform float u_exp,u_con,u_sat,u_temp,u_tint,u_hue,u_fade,u_vig;
vec3 hueRot(vec3 c,float a){ const vec3 k=vec3(0.57735); float ca=cos(a),sa=sin(a); return c*ca+cross(k,c)*sa+k*dot(k,c)*(1.0-ca); }
void main(){ vec3 c=texture(u_src,v_uv).rgb; c*=exp2(u_exp);
  c.r*=1.0+u_temp*0.22; c.b*=1.0-u_temp*0.22; c.g*=1.0-u_tint*0.14; c.rb*=1.0+u_tint*0.07;
  c=(c-0.5)*(1.0+u_con)+0.5; float l=luma(c); c=mix(vec3(l),c,u_sat);
  if(u_hue!=0.0) c=hueRot(c,u_hue);
  c=c*(1.0-u_fade*0.22)+u_fade*0.11; c*=vig(v_uv,u_vig); o=vec4(max(c,0.0),1.0); }`;

S.double = `uniform sampler2D u_img; uniform float u_ia,u_scale,u_flipx,u_mode,u_int,u_desat; uniform vec2 u_off;
void main(){ vec3 c=clamp(texture(u_src,v_uv).rgb,0.0,1.0); vec2 uv=v_uv-0.5; float ra=u_res.x/u_res.y;
  if(ra>u_ia) uv.y*=u_ia/ra; else uv.x*=ra/u_ia; uv=uv/u_scale-u_off; if(u_flipx>0.5) uv.x=-uv.x; uv+=0.5;
  vec2 e=step(vec2(0.0),uv)*step(uv,vec2(1.0)); vec3 s=texture(u_img,uv).rgb; s=mix(s,vec3(luma(s)),u_desat);
  float m=e.x*e.y*u_int; vec3 r;
  if(u_mode==0.0) r=1.0-(1.0-c)*(1.0-s*m);
  else if(u_mode==1.0) r=max(c,s*m);
  else if(u_mode==2.0) r=c*mix(vec3(1.0),s,m);
  else if(u_mode==3.0) r=mix(c,mix(2.0*c*s,1.0-2.0*(1.0-c)*(1.0-s),step(0.5,c)),m);
  else r=mix(c,s,m*0.5);
  o=vec4(r,1.0); }`;

S.grain = `uniform float u_amt,u_size,u_col;
void main(){ vec3 c=texture(u_src,v_uv).rgb; o=vec4(addGrain(c,v_uv*u_res,u_amt,u_size,u_col),1.0); }`;

S.dof = `uniform sampler2D u_b1,u_b2; uniform vec2 u_pt; uniform float u_zone;
void main(){ vec2 p=(v_uv-u_pt)*u_res/u_unit/vec2(u_zone*0.85,u_zone*1.25); float a=smoothstep(0.75,2.4,length(p));
  vec3 s=texture(u_src,v_uv).rgb,b1=texture(u_b1,v_uv).rgb,b2=texture(u_b2,v_uv).rgb;
  o=vec4(a<0.5?mix(s,b1,a*2.0):mix(b1,b2,a*2.0-1.0),1.0); }`;

S.mfgrade = `uniform sampler2D u_hal; uniform float u_halo,u_str,u_sat,u_con,u_gamma,u_vig,u_grain,u_gsize,u_border,u_bw;
uniform vec3 u_lift,u_sh,u_hi,u_green;
void main(){ vec2 m=vec2(u_bw*u_unit)/u_res; vec2 uv=(v_uv-m)/(1.0-2.0*m);
  vec3 c=clamp(texture(u_src,uv).rgb,0.0,1.0);
  vec3 h=texture(u_hal,uv).rgb; c+=vec3(1.0,0.32,0.12)*max(h.r,h.g)*u_halo*(1.0-c);
  vec3 g=c; g=mix(g,g*g*(3.0-2.0*g),u_con); g=pow(g,vec3(u_gamma));
  float l=luma(g); g=mix(vec3(l),g,u_sat);
  float gm=clamp((g.g-max(g.r,g.b))*3.0,0.0,1.0); g+=u_green*gm;
  g+=u_sh*(1.0-l)*(1.0-l)+u_hi*l*l; g=g*(1.0-u_lift)+u_lift;
  g=1.0-(1.0-g)*(1.0-0.04*smoothstep(0.7,1.0,l)); g=min(g,vec3(0.985))+max(g-0.985,0.0)*0.3;
  c=mix(c,g,u_str); c*=vig(uv,u_vig); c=addGrain(c,v_uv*u_res,u_grain,u_gsize,0.35);
  if(u_border>0.0){ vec2 q=abs(uv-0.5)*u_res-0.5*u_res+u_unit*0.004; float d=length(max(q,0.0))-u_unit*0.004;
    float k=smoothstep(-1.0,1.0,d/(u_unit/1800.0));
    vec3 bc=u_border==1.0?vec3(0.965,0.96,0.945):vec3(0.035,0.033,0.03); bc+=grainN(v_uv*u_res,1.2,0.0)*0.012;
    c=mix(c,bc,k); }
  o=vec4(c,1.0); }`;

S.ovl = `uniform sampler2D u_ov; void main(){ vec3 c=texture(u_src,v_uv).rgb; vec4 v=texture(u_ov,v_uv); o=vec4(mix(c,v.rgb,v.a),1.0); }`;

S.card = `uniform vec4 u_rect; uniform vec2 u_sc,u_so; uniform vec3 u_col;
void main(){ vec2 q=(v_uv-u_rect.xy)/u_rect.zw; vec2 d=(abs(q-0.5)-0.5)*u_rect.zw*u_res; float outside=max(d.x,d.y);
  vec3 paper=u_col+grainN(v_uv*u_res,2.2,0.0)*0.012; paper*=1.0-0.07*exp(-max(outside,0.0)/(u_unit*0.004));
  vec3 img=texture(u_src,u_so+clamp(q,0.0,1.0)*u_sc).rgb; o=vec4(mix(img,paper,smoothstep(-0.7,0.7,outside)),1.0); }`;

S.poly = `uniform sampler2D u_i1,u_i2; uniform float u_n,u_dir,u_g,u_m,u_ps,u_pa,u_var,u_seed,u_split,u_a0,u_a1,u_a2,u_has1,u_has2; uniform vec3 u_col;
void main(){ vec2 px=v_uv*u_res; float t=u_dir==0.0?px.x:px.y, c=u_dir==0.0?px.y:px.x, C=u_dir==0.0?u_res.y:u_res.x;
  float local=t-u_m; float id=floor(local/(u_ps+u_g)); float f=local-id*(u_ps+u_g);
  float e=min(min(f,u_ps-f),min(c-u_m,C-u_m-c)); float inside=(local>=0.0&&id<u_n)?smoothstep(-0.6,0.6,e):0.0;
  vec2 q=u_dir==0.0?vec2(f/u_ps,(c-u_m)/(C-2.0*u_m)):vec2((c-u_m)/(C-2.0*u_m),f/u_ps);
  bool own=(id==1.0&&u_has1>0.5)||(id==2.0&&u_has2>0.5);
  float z=1.0+u_var*1.3*hash(vec2(id+u_seed*7.0,1.0));
  vec2 rnd=vec2(hash(vec2(id+u_seed*7.0,2.0)),hash(vec2(id+u_seed*7.0,3.0)))-0.5; vec2 uv;
  if(u_split>0.5&&!own){ vec2 ctr=u_dir==0.0?vec2((u_m+id*(u_ps+u_g)+u_ps*0.5)/u_res.x,0.5):vec2(0.5,(u_m+id*(u_ps+u_g)+u_ps*0.5)/u_res.y);
    uv=ctr+(v_uv-ctr)/z+rnd*u_var*0.35*(u_dir==0.0?vec2(0.3,1.0):vec2(1.0,0.3)); }
  else { float ia=id==1.0&&u_has1>0.5?u_a1:(id==2.0&&u_has2>0.5?u_a2:u_a0); uv=q-0.5;
    if(u_pa>ia) uv.y*=ia/u_pa; else uv.x*=u_pa/ia; if(!own) uv=uv/z+rnd*(1.0-1.0/z); uv+=0.5; }
  vec3 img=id==1.0&&u_has1>0.5?texture(u_i1,uv).rgb:(id==2.0&&u_has2>0.5?texture(u_i2,uv).rgb:texture(u_src,uv).rgb);
  o=vec4(mix(u_col,img,inside),1.0); }`;

S.select = `uniform vec3 u_col; uniform float u_target,u_tol,u_int;
void main(){ vec3 c=clamp(texture(u_src,v_uv).rgb,0.0,1.0); float l=luma(c); float mx=max(c.r,max(c.g,c.b)),mn=min(c.r,min(c.g,c.b)); float m;
  if(u_target==0.0){ float sat=(mx-mn)/max(mx,0.001); float warm=smoothstep(0.0,0.06,c.r-c.g)*smoothstep(-0.02,0.05,c.g-c.b);
    m=warm*smoothstep(0.08-u_tol*0.07,0.2-u_tol*0.1,sat)*smoothstep(0.12-u_tol*0.1,0.3-u_tol*0.15,l)*(1.0-smoothstep(0.55+u_tol*0.4,0.8+u_tol*0.4,sat)); }
  else if(u_target==1.0) m=smoothstep(0.75-u_tol*0.6,0.95-u_tol*0.5,l);
  else m=1.0-smoothstep(0.1+u_tol*0.3,0.3+u_tol*0.6,l);
  o=vec4(mix(c,pow(l,0.8)*u_col*1.6,m*u_int),1.0); }`;

S.serig = `uniform vec3 u_a,u_b; uniform float u_thr,u_soft,u_detail,u_inv;
void main(){ float l=luma(texture(u_src,v_uv).rgb); if(u_inv>0.5) l=1.0-l; float t=smoothstep(u_thr-u_soft,u_thr+u_soft+0.001,l);
  vec3 b=u_b*(1.0-u_detail*0.55*(1.0-smoothstep(u_thr,1.0,l))); vec3 a=u_a*(1.0-u_detail*0.4*(1.0-smoothstep(0.0,u_thr,l)));
  o=vec4(mix(a,b,t),1.0); }`;

S.strobe = `uniform sampler2D u_sharp; uniform float u_count,u_dist,u_angle,u_thr,u_keep;
void main(){ vec3 c=texture(u_src,v_uv).rgb; vec2 d=vec2(cos(u_angle),sin(u_angle))*u_dist*u_unit/u_res;
  c=mix(c,texture(u_sharp,v_uv).rgb,u_keep);
  for(int i=0;i<10;i++){ float k=float(i); if(k>=u_count) break; float t=(k+0.5)/u_count-0.5;
    vec3 s=texture(u_sharp,v_uv+d*t).rgb; float w=smoothstep(u_thr,u_thr+0.1,luma(s)); c=max(c,s*w); }
  o=vec4(c,1.0); }`;

S.raster = `uniform vec3 u_col; uniform float u_angle,u_lines,u_gain,u_lo,u_wave,u_rel,u_style,u_cmode,u_bg,u_inv,u_bri;
vec2 qToUV(vec2 q){ float ca=cos(u_angle),sa=sin(u_angle); return vec2(ca*q.x-sa*q.y,sa*q.x+ca*q.y)*u_unit/u_res+0.5; }
vec3 smp(vec2 q){ return clamp(texture(u_src,qToUV(q)).rgb,0.0,1.0); }
float lm(vec3 c){ float l=clamp(mix(luma(c),max(c.r,max(c.g,c.b)),0.55)+u_bri,0.0,1.0); return u_inv>0.5?1.0-l:l; }
void main(){
  float ca=cos(u_angle),sa=sin(u_angle);
  vec2 p=(v_uv-0.5)*u_res/u_unit; vec2 q=vec2(ca*p.x+sa*p.y,-sa*p.x+ca*p.y);
  float cpp=u_lines/u_unit, e=0.5/u_lines;
  float lp=0.25*(lm(smp(q+vec2(-e,-e)))+lm(smp(q+vec2(e,-e)))+lm(smp(q+vec2(-e,e)))+lm(smp(q+vec2(e,e))));
  float z=sin(q.x*u_lines*2.4+floor(q.y*u_lines)*1.9);
  float shift=u_rel*2.0*(lp-0.5)+u_wave*0.45*z*(0.35+lp);
  float yy=q.y*u_lines+shift; float cell=floor(yy); float f=yy-cell-0.5;
  vec2 qc=vec2(q.x,(cell+0.5-shift)/u_lines);
  vec3 sc=(smp(qc+vec2(-e,0.0))+smp(qc)*2.0+smp(qc+vec2(e,0.0)))*0.25;
  float lc=lm(sc);
  float t=pow(clamp((lc-u_lo)/max(1.0-u_lo,0.05),0.0,1.0),0.8);
  float w=t*0.5*u_gain, aa=cpp*0.8, cov;
  if(u_style<0.5) cov=1.0-smoothstep(w-aa,w+aa,abs(f));
  else if(u_style<1.5){ float fa=fract(q.x*u_lines*0.5)-0.5; cov=(1.0-smoothstep(w-aa,w+aa,abs(f)))*(1.0-smoothstep(0.34-aa,0.34+aa,abs(fa))); }
  else { float fa=fract(q.x*u_lines+0.5*mod(cell,2.0))-0.5; cov=1.0-smoothstep(w-aa,w+aa,length(vec2(fa,f))); }
  cov*=smoothstep(0.0,aa*1.5,w);
  float core=pow(clamp(1.0-abs(f)/max(w,0.02),0.0,1.0),1.5);
  vec3 base=u_cmode<0.5?u_col:clamp(sc/max(max(sc.r,max(sc.g,sc.b)),0.06),0.0,1.0);
  vec3 line=cov*(base*(0.55+0.75*t)+vec3(0.6)*core*core);
  vec2 g=vec2(fract(q.x*u_lines)-0.5,fract(q.y*u_lines)-0.5);
  vec3 bg=u_col*u_bg*(0.05+0.22*(1.0-smoothstep(0.1,0.24,length(g))));
  o=vec4(bg+line,1.0); }`;

S.crt = `uniform float u_vert,u_lines,u_str,u_mask,u_curv,u_roll,u_rpos,u_vig;
void main(){
  vec2 c=v_uv*2.0-1.0; c*=1.0+u_curv*0.2*vec2(c.y*c.y,c.x*c.x); vec2 uv=c*0.5+0.5;
  vec2 ed=smoothstep(vec2(0.0),vec2(0.006),uv)*smoothstep(vec2(0.0),vec2(0.006),1.0-uv);
  vec3 s=clamp(texture(u_src,clamp(uv,0.0,1.0)).rgb,0.0,1.0); float lum=luma(s);
  float coord=u_vert>0.5?uv.x*u_res.x:uv.y*u_res.y; float period=max(2.0,u_unit/u_lines);
  float beam=0.5+0.5*cos(6.2831853*coord/period);
  float scan=mix(1.0,pow(beam,mix(1.8,0.55,lum)),u_str);
  float sub=max(1.0,u_unit/(u_lines*1.5)); float xs=(u_vert>0.5?uv.y*u_res.y:uv.x*u_res.x)/sub;
  vec3 m=pow(0.5+0.5*cos(6.2831853*(xs/3.0-vec3(0.0,0.3333,0.6667))),vec3(1.4))*2.2;
  s*=mix(vec3(1.0),m,u_mask);
  s*=scan*(1.0+0.5*u_str)*(1.0+0.25*u_mask);
  float bar=exp(-pow((uv.y-u_rpos)/0.07,2.0)); s*=1.0+u_roll*0.8*bar-u_roll*0.1;
  s*=vig(uv,u_vig)*ed.x*ed.y;
  o=vec4(s,1.0); }`;

S.vhs = `uniform float u_chroma,u_soft,u_jit,u_tear,u_noise,u_drop,u_fade,u_sat,u_seed,u_ring;
vec3 toYuv(vec3 c){ return vec3(dot(c,vec3(0.299,0.587,0.114)),dot(c,vec3(-0.147,-0.289,0.436)),dot(c,vec3(0.615,-0.515,-0.100))); }
vec3 toRgb(float y,vec2 uv){ return vec3(y+1.140*uv.y,y-0.395*uv.x-0.581*uv.y,y+2.032*uv.x); }
void main(){
  vec2 px=v_uv*u_res; float lineH=max(1.0,u_unit/640.0); float ry=floor(px.y/lineH); float t=u_seed; float k=u_unit/u_res.x;
  float j=(hash(vec2(ry,t))-0.5)*0.004*u_jit+sin(ry*0.045+t*2.1)*0.0016*u_jit+sin(ry*0.011+t)*0.0025*u_jit;
  float tear=smoothstep(0.93,1.0,v_uv.y);
  j+=tear*u_tear*(0.05*(hash(vec2(ry,t+9.0))-0.3)+0.02*sin(v_uv.y*90.0));
  float bp=fract(0.27+t*0.137); float band=1.0-smoothstep(0.0,0.03,abs(v_uv.y-bp));
  j+=band*u_tear*0.045*(hash(vec2(ry,t+3.0))-0.4);
  vec2 uv0=vec2(v_uv.x+j,(ry+0.5)*lineH/u_res.y);
  float dx=(0.0016+0.0016*u_soft)*k;
  float y0=toYuv(texture(u_src,uv0).rgb).x;
  float yl=0.25*toYuv(texture(u_src,uv0-vec2(dx,0.0)).rgb).x+0.5*y0+0.25*toYuv(texture(u_src,uv0+vec2(dx,0.0)).rgb).x;
  float gh=toYuv(texture(u_src,uv0-vec2(dx*7.0,0.0)).rgb).x;
  float Y=y0+u_ring*1.6*(y0-yl)+u_ring*0.14*(gh-y0);
  float cs=u_chroma*0.007*k, dxc=dx*(1.5+u_soft*3.5); vec2 cc=vec2(0.0);
  for(int i=0;i<8;i++){ float kk=float(i)-3.5; cc+=toYuv(texture(u_src,vec2(uv0.x+cs+kk*dxc,uv0.y)).rgb).yz; }
  cc/=8.0;
  vec3 col=toRgb(Y,cc*u_sat);
  float n=(vn(vec2(px.x/(lineH*7.0),ry*0.8),t*3.0)-0.5)+(hash(vec2(floor(px.x/max(1.0,lineH*0.8)),ry+t*131.0))-0.5)*0.6;
  col+=n*u_noise*0.25;
  col+=tear*u_tear*(hash(vec2(floor(px.x*0.5),ry+t*17.0))-0.35)*0.45;
  if(hash(vec2(ry,t+17.0))>1.0-u_drop*0.015){ float seg=vn(vec2(px.x/(u_unit*0.05),ry),t*5.0); col+=smoothstep(0.55,0.8,seg)*0.7; }
  col=col*(1.0-u_fade*0.2)+u_fade*vec3(0.07,0.06,0.085);
  col*=1.0-0.05*mod(ry,2.0);
  o=vec4(col,1.0); }`;

S.texture = `uniform float u_type,u_amt,u_scale,u_angle,u_seed; uniform vec3 u_col;
float fbm(vec2 p,float s){ return (0.5*vn(p,s)+0.25*vn(p*2.03,s+1.0)+0.125*vn(p*4.1,s+2.0)+0.0625*vn(p*8.3,s+3.0))/0.9375; }
void main(){
  vec2 p=(v_uv-0.5)*u_res/u_unit; float px=1.0/u_unit; float a=u_amt, s=u_scale, sd=u_seed;
  vec3 c=texture(u_src,v_uv).rgb;
  if(u_type<0.5){
    float F=70.0*s, e=0.35/F; float h=fbm(p*F,sd);
    float lt=(h-fbm((p+vec2(e,0.0))*F,sd))+(h-fbm((p+vec2(0.0,e))*F,sd));
    float fib=vn(vec2(p.x*260.0*s,p.y*34.0*s),sd+5.0)*vn(vec2(p.y*260.0*s,p.x*34.0*s),sd+6.0);
    c*=1.0+a*(lt*0.9+(fib-0.25)*0.3-0.03);
    c=mix(c,c*vec3(1.03,1.0,0.93),a*0.6);
    c+=(hash(floor(v_uv*u_res/max(1.0,u_unit/2200.0)))-0.5)*a*0.05;
  } else if(u_type<1.5){
    float cs=1.0/(38.0*s); vec2 g=p/cs; vec2 id=floor(g); vec2 f=fract(g); vec2 sid=id+vec2(sd*13.0,sd*7.0);
    if(hash(sid)<a*0.22){
      vec2 ctr=vec2(hash(sid+vec2(37.0,11.0)),hash(sid+vec2(71.0,53.0)))*0.5+0.25; float h3=hash(sid+vec2(23.0,89.0));
      float rr=0.0006+0.0035*h3*h3*h3; float d=length(f-ctr)*cs; float spk=1.0-smoothstep(rr-px,rr+px,d);
      c=mix(c,vec3(hash(sid+vec2(5.0,3.0))>0.45?0.95:0.03),spk*0.9); }
    float sc=60.0*s; float cx=p.x*sc; float sx=floor(cx); vec2 si=vec2(sx+sd*29.0,3.0);
    if(hash(si)<a*0.1){
      float lp=(hash(si+vec2(0.0,5.0))-0.5)*0.7; float wd=0.0005+0.0007*hash(si+vec2(0.0,9.0)); float d=abs(fract(cx)-0.5-lp)/sc;
      float seg=smoothstep(0.55,0.7,vn(vec2(p.y*(2.0+3.0*hash(si+vec2(0.0,13.0))),sx),sd));
      c=mix(c,vec3(0.93),(1.0-smoothstep(wd-px,wd+px,d))*seg*0.8); }
  } else if(u_type<2.5){
    vec2 dir=vec2(cos(u_angle),sin(u_angle)); float d=dot(v_uv-0.5,dir)+0.5;
    float start=mix(0.92,0.05,clamp(s/2.6,0.0,1.0));
    float lk=smoothstep(start,1.04,d); lk*=0.55+0.9*fbm(p*2.6+sd,sd);
    vec2 bc=vec2(hash(vec2(sd,1.0)),hash(vec2(sd,2.0)))-0.5; vec2 bq=v_uv-0.5-bc;
    lk=clamp(lk+exp(-dot(bq,bq)*(6.0/s))*0.3,0.0,1.4);
    vec3 lc=mix(u_col,vec3(1.0,0.9,0.55),clamp(lk*lk,0.0,1.0)*0.8);
    c=1.0-(1.0-c)*(1.0-clamp(lk*lc*a*1.3,0.0,1.0));
  } else if(u_type<3.5){
    float shade=0.0, crack=0.0; float w=0.05*s;
    for(int i=0;i<3;i++){ float fi=float(i); float an=hash(vec2(fi+sd*5.0,1.0))*3.14159; vec2 n=vec2(cos(an),sin(an));
      float off=(hash(vec2(fi+sd*5.0,2.0))-0.5)*0.9; float dd=dot(p,n)-off+(fbm(p*5.0+fi*9.0,sd)-0.5)*0.012;
      float on=step(hash(vec2(fi+sd*5.0,4.0)),0.35+0.65*a);
      shade+=on*sign(dd)*exp(-abs(dd)/w); crack+=on*(1.0-smoothstep(px*0.8,px*2.4,abs(dd))); }
    c*=1.0+a*0.3*shade; c=mix(c,vec3(0.96),clamp(crack,0.0,1.0)*a*0.4);
  } else if(u_type<4.5){
    vec2 wv=p*190.0*s; float chk=mod(floor(wv.x)+floor(wv.y),2.0);
    float hx=1.0-pow(abs(fract(wv.x)-0.5)*2.0,2.0), hy=1.0-pow(abs(fract(wv.y)-0.5)*2.0,2.0); float h=mix(hx,hy,chk);
    float slub=vn(vec2(wv.x*0.9,wv.y*0.06),sd)*0.5+vn(vec2(wv.x*0.06,wv.y*0.9),sd+3.0)*0.5;
    c*=1.0+a*(0.7*(h-0.6)+0.5*(slub-0.5));
  } else if(u_type<5.5){
    vec2 dir=vec2(cos(u_angle),sin(u_angle)); float fr=50.0*s; float f=fract(dot(p,dir)*fr); float off=f-0.5;
    vec2 dl=dir*off*a*1.5/fr*u_unit/u_res;
    c=vec3(texture(u_src,v_uv+dl*1.12).r,texture(u_src,v_uv+dl).g,texture(u_src,v_uv+dl*0.88).b);
    c*=1.0-a*0.3*pow(abs(off)*2.0,6.0); c*=1.0+(0.5-f)*0.1*a;
  } else {
    float cx=p.x*95.0*s, id=floor(cx); vec2 si=vec2(id+sd*31.0,7.0); float hh=hash(si+vec2(1.0,0.0));
    if(hash(si)<a*0.26){
      float xo=(hash(si+vec2(2.0,0.0))-0.5)*0.7+(vn(vec2(p.y*2.5,id),sd)-0.5)*0.35;
      float wd=(0.0004+0.0011*hh)/s; float d=abs(fract(cx)-0.5-xo)/(95.0*s);
      float seg=smoothstep(0.3,0.5,vn(vec2(p.y*(0.9+2.2*hh),id*1.7),sd+9.0));
      c=mix(c,vec3(0.94),(1.0-smoothstep(wd-px,wd+px,d))*seg*0.85); }
    float bx=p.x*8.0*s, bid=floor(bx); vec2 bi=vec2(bid+sd*17.0,5.0);
    if(hash(bi)<a*0.45){
      float xo=(hash(bi+vec2(1.0,0.0))-0.5)*0.6+(vn(vec2(p.y*1.4,bid),sd+4.0)-0.5)*0.3; float d=abs(fract(bx)-0.5-xo)/(8.0*s);
      float seg=smoothstep(0.2,0.42,vn(vec2(p.y*0.8,bid*2.3),sd+2.0));
      c=mix(c,vec3(0.97),(1.0-smoothstep(0.0012-px,0.0012+px,d))*seg*0.8); }
    float cs=1.0/(110.0*s); vec2 g=p/cs; vec2 gid=floor(g)+vec2(sd*13.0,sd*7.0);
    if(hash(gid)<a*0.1){ vec2 ctr=vec2(hash(gid+vec2(37.0,11.0)),hash(gid+vec2(71.0,53.0)))*0.5+0.25; float h3=hash(gid+vec2(23.0,89.0));
      float rr=0.0004+0.0018*h3*h3; float dd=length(fract(g)-ctr)*cs; c=mix(c,vec3(hash(gid+vec2(5.0,3.0))>0.3?0.95:0.03),(1.0-smoothstep(rr-px,rr+px,dd))*0.85); }
  }
  o=vec4(max(c,0.0),1.0); }`;

S.glitch = `uniform float u_n,u_amt,u_prob,u_soft,u_chroma,u_seed,u_vert;
void main(){
  float coord=u_vert>0.5?v_uv.x:v_uv.y;
  float b=floor(coord*u_n), b2=floor(coord*u_n*0.3);
  float a1=step(1.0-u_prob,hash(vec2(b,u_seed+7.0))), a2=step(1.0-u_prob*0.6,hash(vec2(b2,u_seed+11.0)));
  float shift=(hash(vec2(b,u_seed+3.0))-0.5)*2.0*u_amt*a1+(hash(vec2(b2,u_seed+13.0))-0.5)*2.0*u_amt*1.5*a2;
  vec2 cd=u_vert>0.5?vec2(0.0,1.0):vec2(1.0,0.0); vec2 d=cd*shift; float act=step(0.0001,abs(shift));
  vec3 acc=vec3(0.0);
  for(int i=0;i<10;i++){ float t=float(i)/9.0; vec2 uv=v_uv-d*(1.0-u_soft*t); vec2 ch=cd*u_chroma*0.012*act;
    acc+=vec3(texture(u_src,uv+ch).r,texture(u_src,uv).g,texture(u_src,uv-ch).b); }
  o=vec4(acc/10.0,1.0); }`;

S.thermal = `uniform float u_pal,u_steps,u_dither,u_con,u_mix,u_shift;
vec3 pal(float t){
  if(u_pal<0.5) return 0.5+0.5*cos(6.2831853*(t+vec3(0.0,0.33,0.67)));
  if(u_pal<1.5) return 0.5+0.5*cos(6.2831853*(t*vec3(1.0,1.0,0.5)+vec3(0.8,0.9,0.3)));
  return vec3(smoothstep(0.1,0.55,t),smoothstep(0.45,0.9,t)*0.9,mix(0.5*smoothstep(0.0,0.3,t)*(1.0-smoothstep(0.3,0.6,t)),1.0,smoothstep(0.85,1.0,t))); }
void main(){ vec3 c=clamp(texture(u_src,v_uv).rgb,0.0,1.0); float l=clamp((luma(c)-0.5)*(1.0+u_con)+0.5,0.0,1.0);
  if(u_steps<32.5){ float n=u_steps; l=floor(clamp(l+(ign(gl_FragCoord.xy)-0.5)*u_dither/n,0.0,0.999)*n)/(n-1.0); }
  vec3 g=pal(u_pal>1.5?l:l*0.85+u_shift);
  o=vec4(mix(c,g,u_mix),1.0); }`;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const rad = (d) => (d * Math.PI) / 180;

export const SHUTTER = ['1/500', '1/250', '1/125', '1/60', '1/30', '1/15', '1/8', '1/4', '1/2', '1″', '2″'];
const SHUTTER_T = [1 / 500, 1 / 250, 1 / 125, 1 / 60, 1 / 30, 1 / 15, 1 / 8, 1 / 4, 1 / 2, 1, 2];

export const FORMATS = { orig: 0, '135': 3 / 2, '645': 4 / 3, '66': 1, '67': 5 / 4, '69': 3 / 2, xpan: 65 / 24 };

const STOCKS = {
  warm: { sat: 0.93, con: 0.18, gamma: 0.95, lift: [0.035, 0.03, 0.026], sh: [-0.012, 0.008, 0.016], hi: [0.032, 0.012, -0.022], green: [0.035, -0.01, -0.02] },
  cool: { sat: 0.84, con: 0.1, gamma: 0.9, lift: [0.045, 0.05, 0.05], sh: [-0.016, 0.014, 0.012], hi: [-0.004, 0.012, 0.01], green: [-0.035, 0.0, 0.03] },
  vivid: { sat: 1.24, con: 0.42, gamma: 1.02, lift: [0.008, 0.008, 0.01], sh: [-0.008, 0.0, 0.014], hi: [0.02, 0.006, -0.012], green: [0.0, 0.02, -0.01] },
  bw: { sat: 0, con: 0.38, gamma: 0.98, lift: [0.022, 0.022, 0.022], sh: [0, 0, 0], hi: [0.008, 0.004, -0.004], green: [0, 0, 0] },
  portra: { sat: 0.95, con: 0.2, gamma: 0.94, lift: [0.04, 0.034, 0.03], sh: [-0.012, 0.01, 0.016], hi: [0.034, 0.014, -0.024], green: [0.04, -0.012, -0.02] },
  ultramax: { sat: 1.2, con: 0.34, gamma: 0.98, lift: [0.02, 0.022, 0.016], sh: [-0.006, 0.016, -0.004], hi: [0.04, 0.016, -0.034], green: [0.025, 0.02, -0.025] },
  kodachrome: { sat: 1.18, con: 0.55, gamma: 1.06, lift: [0.006, 0.006, 0.012], sh: [-0.014, -0.006, 0.026], hi: [0.026, 0.004, -0.02], green: [-0.02, 0.0, 0.01] },
  gold: { sat: 1.1, con: 0.26, gamma: 0.96, lift: [0.03, 0.026, 0.014], sh: [0.006, 0.008, -0.012], hi: [0.045, 0.024, -0.04], green: [0.04, 0.01, -0.03] },
  superia: { sat: 1.06, con: 0.3, gamma: 0.98, lift: [0.018, 0.026, 0.022], sh: [-0.02, 0.022, 0.006], hi: [0.014, -0.004, 0.012], green: [-0.03, 0.02, 0.02] },
  cine: { sat: 1.02, con: 0.28, gamma: 0.97, lift: [0.016, 0.024, 0.036], sh: [-0.024, 0.008, 0.034], hi: [-0.012, 0.01, 0.03], green: [-0.01, 0.0, 0.02] },
  trix: { sat: 0, con: 0.55, gamma: 1.0, lift: [0.02, 0.02, 0.02], sh: [0, 0, 0], hi: [0, 0, 0], green: [0, 0, 0] },
  instax: { sat: 1.06, con: 0.34, gamma: 0.96, lift: [0.035, 0.04, 0.052], sh: [-0.012, 0.008, 0.022], hi: [0.012, 0.01, -0.006], green: [0.0, 0.012, 0.0] },
  neutral: { sat: 1, con: 0.1, gamma: 1, lift: [0.012, 0.012, 0.012], sh: [0, 0, 0], hi: [0, 0, 0], green: [0, 0, 0] },
};

const R = (k, label, min, max, def, extra = {}) => ({ k, label, type: 'range', min, max, step: 1, def, ...extra });
const deg = (v) => `${v}°`;
const pct = (v) => `${v}`;

// Halo lumineux serré + large, additionné à l'image (prend possession de inp).
function bloom(E, inp, amt, thr = 0.25) {
  const br = E.target(Math.ceil(inp.w / 2), Math.ceil(inp.h / 2));
  E.draw('bright', br, { u_src: inp, u_thr: thr, u_px: 2 });
  const big = Math.max(br.w, br.h), b1 = E.blur(br, 0.004 * big), b2 = E.blur(br, 0.02 * big);
  E.release(br);
  const g1 = E.pass('glowmix', inp, { u_glow: b1, u_int: amt * 0.9, u_tint: [1, 1, 1] });
  const g2 = E.pass('glowmix', g1, { u_glow: b2, u_int: amt * 1.3, u_tint: [1, 1, 1] });
  E.release(b1); E.release(b2); E.release(g1); E.release(inp);
  return g2;
}

const TEX = ['paper', 'dust', 'leak', 'fold', 'canvas', 'glass', 'scratch'];

// Étalonnage pellicule partagé : halation, courbe, teintes, vignettage, grain, bordure.
function filmGrade(E, cur, st, o) {
  const unit = Math.max(cur.w, cur.h);
  const br = E.target(Math.ceil(cur.w / 2), Math.ceil(cur.h / 2));
  E.draw('bright', br, { u_src: cur, u_thr: 0.72, u_px: 2 });
  const hal = E.blur(br, (o.halr || 0.006) * unit); E.release(br);
  const out = E.pass('mfgrade', cur, { u_hal: hal, u_halo: o.halo, u_str: o.str, u_sat: st.sat, u_con: st.con, u_gamma: st.gamma, u_lift: st.lift, u_sh: st.sh, u_hi: st.hi, u_green: st.green, u_vig: o.vig, u_grain: o.grain, u_gsize: o.gsize, u_border: o.border || 0, u_bw: o.border ? 0.035 : 0 });
  E.release(hal);
  return out;
}

const STOCK35 = [['portra', 'Portra 400'], ['ultramax', 'Ultramax 400'], ['kodachrome', 'Kodachrome 64'], ['gold', 'Gold 200'], ['superia', 'Superia 400'], ['cine', 'Ciné 800T'], ['trix', 'Tri-X 400']];

// Amorce 35 mm : repères et nom de la pellicule le long des grands côtés.
function rebate(w, h, label) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), L = Math.max(w, h), S = Math.min(w, h), bw = 0.035 * L;
  if (h > w) { g.translate(w, 0); g.rotate(Math.PI / 2); }
  g.fillStyle = '#f2a23a'; g.textBaseline = 'middle';
  g.font = `700 ${bw * 0.44}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  const y0 = bw * 0.52, y1 = S - bw * 0.48;
  g.fillText('53', L * 0.1, y0); g.fillText(label.toUpperCase(), L * 0.36, y0); g.fillText('54', L * 0.84, y0);
  g.fillText('▶ 11', L * 0.08, y1); g.fillText('11A', L * 0.33, y1); g.fillText('▶ 12', L * 0.58, y1); g.fillText('12A', L * 0.83, y1);
  return c;
}

const INSTAX = { mini: { card: [54, 86], img: [46, 62], top: 7 }, square: { card: [72, 86], img: [62, 62], top: 7.5 }, wide: { card: [108, 86], img: [99, 62], top: 7.5 } };

// Catalogue des effets. render(E, input, params, layer) renvoie une nouvelle cible.
export const FX = {
  motion: {
    name: "Vitesse d'obturation", group: 'Mouvement', hint: 'Filé de pose lente, flash second rideau',
    params: [
      R('shutter', 'Vitesse', 0, 10, 6, { fmt: (v) => SHUTTER[v] }),
      R('move', 'Mouvement', 0, 100, 40, { fmt: pct }),
      R('angle', 'Angle', -180, 180, 0, { fmt: deg }),
      R('trail', 'Traînée', 0, 100, 0, { fmt: pct }),
      R('flash', 'Flash (sujet net)', 0, 100, 0, { fmt: pct }),
    ],
    render(E, inp, p) {
      const len = (p.move / 100) * 0.5 * Math.pow(SHUTTER_T[p.shutter] / 2, 0.6);
      if (len <= 0) return inp;
      const u = { u_angle: rad(p.angle), u_trail: p.trail / 100 };
      const a = E.pass('motion', inp, { ...u, u_len: len, u_jit: 0.6 });
      let b = E.pass('motion', a, { u_angle: u.u_angle, u_trail: 0, u_len: len / 32, u_jit: 0 });
      E.release(a);
      if (p.flash > 0) { const c = E.pass('flash', b, { u_sharp: inp, u_f: p.flash / 100 }); E.release(b); b = c; }
      return b;
    },
  },
  strobe: {
    name: 'Stroboscope', group: 'Mouvement', hint: 'Bougé avec reflets saccadés',
    params: [
      R('blur', 'Bougé', 0, 100, 45, { fmt: pct }),
      R('count', 'Éclats', 2, 10, 5),
      R('dist', 'Écart', 0, 100, 35, { fmt: pct }),
      R('angle', 'Angle', -180, 180, 0, { fmt: deg }),
      R('thr', 'Seuil', 30, 98, 72, { fmt: pct }),
      R('keep', 'Netteté conservée', 0, 100, 20, { fmt: pct }),
    ],
    render(E, inp, p) {
      const u = { u_angle: rad(p.angle), u_trail: 0 }, len = (p.blur / 100) * 0.12 + 0.0005;
      const a = E.pass('motion', inp, { ...u, u_len: len, u_jit: 0.6 });
      const b = E.pass('motion', a, { ...u, u_len: len / 32, u_jit: 0 }); E.release(a);
      const out = E.pass('strobe', b, { u_sharp: inp, u_count: p.count, u_dist: (p.dist / 100) * 0.16, u_angle: rad(p.angle), u_thr: p.thr / 100, u_keep: (p.keep / 100) * 0.6 });
      E.release(b); return out;
    },
  },
  smear: {
    name: 'Balayage', group: 'Mouvement', hint: 'Stries irrégulières, façon scanner',
    params: [
      R('len', 'Longueur', 0, 100, 40, { fmt: pct }),
      R('angle', 'Angle', -180, 180, 0, { fmt: deg }),
      R('band', 'Largeur des bandes', 1, 100, 30, { fmt: pct }),
      R('irr', 'Irrégularité', 0, 100, 80, { fmt: pct }),
      R('lines', 'Lignes', 0, 100, 40, { fmt: pct }),
    ],
    render: (E, inp, p) => E.pass('smear', inp, { u_len: (p.len / 100) * 0.35, u_angle: rad(p.angle), u_band: 0.004 + (p.band / 100) * 0.12, u_irr: p.irr / 100, u_lines: p.lines / 100 }),
  },
  ghost: {
    name: 'Exposition multiple', group: 'Mouvement', hint: 'Échos décalés du sujet',
    params: [
      R('count', 'Copies', 2, 8, 3),
      R('dist', 'Décalage', 0, 100, 18, { fmt: pct }),
      R('angle', 'Angle', -180, 180, 0, { fmt: deg }),
      R('scale', 'Échelle', 80, 125, 100, { fmt: (v) => `${v}%` }),
      R('rot', 'Rotation', -30, 30, 0, { fmt: deg }),
      R('decay', 'Persistance', 10, 100, 75, { fmt: pct }),
      R('tint', 'Teinte des copies', 0, 100, 0, { fmt: pct }),
      { k: 'mode', label: 'Fusion', type: 'select', def: 'avg', options: [['avg', 'Moyenne'], ['lighten', 'Éclaircir'], ['screen', 'Écran'], ['darken', 'Assombrir']] },
    ],
    render: (E, inp, p) => E.pass('ghost', inp, { u_count: p.count, u_dist: (p.dist / 100) * 0.3, u_angle: rad(p.angle), u_scale: p.scale / 100, u_rot: rad(p.rot), u_decay: p.decay / 100, u_tint: p.tint / 100, u_mode: ['avg', 'lighten', 'screen', 'darken'].indexOf(p.mode) }),
  },
  zoom: {
    name: 'Zoom & rotation', group: 'Mouvement', hint: 'Flou radial autour d’un point', point: true,
    params: [
      { k: 'type', label: 'Type', type: 'select', def: 'zoom', options: [['zoom', 'Zoom'], ['spin', 'Rotation']] },
      R('amt', 'Intensité', 0, 100, 30, { fmt: pct }),
    ],
    render: (E, inp, p, L) => E.pass('zoom', inp, { u_amt: (p.amt / 100) * (p.type === 'zoom' ? 0.6 : 0.5), u_type: p.type === 'zoom' ? 0 : 1, u_pt: L.pt }),
  },
  prism: {
    name: 'Prisme', group: 'Optique', hint: 'Facettes et reflets démultipliés', point: true,
    params: [
      { k: 'type', label: 'Forme', type: 'select', def: 'radial', options: [['radial', 'Facettes'], ['bands', 'Bandes']] },
      R('facets', 'Facettes', 2, 12, 5),
      R('amount', 'Décalage', 0, 100, 40, { fmt: pct }),
      R('core', 'Centre net', 0, 100, 25, { fmt: pct }),
      R('soft', 'Douceur', 0, 100, 35, { fmt: pct }),
      R('disp', 'Dispersion', 0, 100, 20, { fmt: pct }),
      R('rot', 'Rotation', -180, 180, 0, { fmt: deg }),
    ],
    render: (E, inp, p, L) => E.pass('prism', inp, { u_facets: p.facets, u_amount: (p.amount / 100) * 0.3, u_core: p.core / 100, u_soft: p.soft / 100, u_disp: (p.disp / 100) * 0.25, u_rot: rad(p.rot), u_type: p.type === 'radial' ? 0 : 1, u_pt: L.pt }),
  },
  glow: {
    name: 'Halo & diffusion', group: 'Optique', hint: 'Lueur douce, filtre brume',
    params: [
      R('thr', 'Seuil', 0, 95, 50, { fmt: pct }),
      R('radius', 'Rayon', 1, 100, 35, { fmt: pct }),
      R('int', 'Intensité', 0, 100, 50, { fmt: pct }),
      { k: 'tint', label: 'Teinte', type: 'color', def: '#ffffff' },
    ],
    render(E, inp, p) {
      const br = E.target(Math.ceil(inp.w / 2), Math.ceil(inp.h / 2));
      E.draw('bright', br, { u_src: inp, u_thr: p.thr / 100, u_px: 2 });
      const bl = E.blur(br, (p.radius / 100) * 0.05 * Math.max(br.w, br.h)); E.release(br);
      const out = E.pass('glowmix', inp, { u_glow: bl, u_int: (p.int / 100) * 1.4, u_tint: hex(p.tint) });
      E.release(bl); return out;
    },
  },
  blur: {
    name: 'Flou', group: 'Optique', hint: 'Flou gaussien, à combiner avec une zone',
    params: [R('radius', 'Rayon', 0, 100, 25, { fmt: pct })],
    render: (E, inp, p) => (p.radius > 0 ? E.blur(inp, (p.radius / 100) * 0.04 * Math.max(inp.w, inp.h), true) : inp),
  },
  chroma: {
    name: 'Aberration chromatique', group: 'Optique', hint: 'Franges rouges et bleues',
    params: [
      { k: 'type', label: 'Type', type: 'select', def: 'radial', options: [['radial', 'Radiale'], ['linear', 'Linéaire']] },
      R('amt', 'Intensité', 0, 100, 30, { fmt: pct }),
      R('angle', 'Angle', -180, 180, 0, { fmt: deg, when: (p) => p.type === 'linear' }),
    ],
    render: (E, inp, p) => E.pass('chroma', inp, { u_amt: (p.amt / 100) * 0.03, u_type: p.type === 'radial' ? 0 : 1, u_angle: rad(p.angle) }),
  },
  medium: {
    name: 'Moyen format', group: 'Optique', hint: 'Rendu 6×7 : profondeur, pellicule, halation', point: true,
    params: [
      { k: 'format', label: 'Format', type: 'select', def: '67', options: [['orig', 'Original'], ['645', '6 × 4.5'], ['66', '6 × 6'], ['67', '6 × 7'], ['69', '6 × 9'], ['xpan', 'Panoramique']] },
      { k: 'stock', label: 'Pellicule', type: 'select', def: 'warm', options: [['warm', 'Portrait chaud'], ['cool', 'Pastel frais'], ['vivid', 'Diapo vive'], ['bw', 'Noir & blanc'], ['neutral', 'Neutre']] },
      R('str', 'Rendu pellicule', 0, 100, 85, { fmt: pct }),
      R('dof', 'Flou d’arrière-plan', 0, 100, 40, { fmt: pct }),
      R('zone', 'Zone nette', 5, 100, 40, { fmt: pct }),
      R('halo', 'Halation', 0, 100, 35, { fmt: pct }),
      R('vig', 'Vignettage', 0, 100, 25, { fmt: pct }),
      R('grain', 'Grain', 0, 100, 30, { fmt: pct }),
      { k: 'border', label: 'Bordure', type: 'select', def: 'none', options: [['none', 'Aucune'], ['white', 'Blanche'], ['black', 'Négatif']] },
    ],
    render(E, inp, p, L) {
      const unit = Math.max(inp.w, inp.h);
      let cur = inp;
      if (p.dof > 0) {
        const s = (p.dof / 100) * 0.014 * unit;
        const b1 = E.blur(inp, s * 0.4), b2 = E.blur(inp, s);
        cur = E.pass('dof', inp, { u_b1: b1, u_b2: b2, u_pt: L.pt, u_zone: 0.05 + (p.zone / 100) * 0.45 });
        E.release(b1); E.release(b2);
      }
      const out = filmGrade(E, cur, STOCKS[p.stock], { str: p.str / 100, halo: (p.halo / 100) * 0.9, vig: (p.vig / 100) * 0.55, grain: (p.grain / 100) * 0.09, gsize: 1.15, border: ['none', 'white', 'black'].indexOf(p.border) });
      if (cur !== inp) E.release(cur);
      return out;
    },
  },
  film35: {
    name: 'Film 35 mm', group: 'Pellicule', hint: 'Portra, Ultramax, Kodachrome… grain 135',
    params: [
      { k: 'stock', label: 'Pellicule', type: 'select', def: 'portra', options: STOCK35 },
      { k: 'format', label: 'Format', type: 'select', def: 'orig', options: [['orig', 'Original'], ['135', '24 × 36']] },
      R('str', 'Rendu pellicule', 0, 100, 90, { fmt: pct }),
      R('grain', 'Grain', 0, 100, 55, { fmt: pct }),
      R('halo', 'Halation', 0, 100, 40, { fmt: pct }),
      R('vig', 'Vignettage', 0, 100, 30, { fmt: pct }),
      { k: 'border', label: 'Amorce du film', type: 'toggle', def: false },
    ],
    render(E, inp, p) {
      const cine = p.stock === 'cine';
      let out = filmGrade(E, inp, STOCKS[p.stock], { str: p.str / 100, halo: (p.halo / 100) * (cine ? 1.8 : 1), halr: cine ? 0.012 : 0.007, vig: (p.vig / 100) * 0.6, grain: (p.grain / 100) * 0.16, gsize: 1.9, border: p.border ? 2 : 0 });
      if (p.border) {
        const label = STOCK35.find((o) => o[0] === p.stock)[1];
        const k = Math.min(1, 3000 / Math.max(out.w, out.h)), w = Math.round(out.w * k), h = Math.round(out.h * k);
        const ov = E.cached(`rebate:${w}x${h}:${label}`, () => rebate(w, h, label));
        const t = E.pass('ovl', out, { u_ov: ov }); E.release(out); out = t;
      }
      return out;
    },
  },
  instax: {
    name: 'Instax', group: 'Pellicule', hint: 'Tirage instantané avec son cadre',
    params: [
      { k: 'format', label: 'Format', type: 'select', def: 'mini', options: [['mini', 'Mini'], ['square', 'Carré'], ['wide', 'Wide']] },
      { k: 'frame', label: 'Cadre', type: 'select', def: '#f5f3ec', options: [['#f5f3ec', 'Blanc'], ['#ece3cf', 'Crème'], ['#161616', 'Noir']] },
      R('str', 'Rendu instantané', 0, 100, 85, { fmt: pct }),
      R('grain', 'Grain', 0, 100, 25, { fmt: pct }),
      R('vig', 'Vignettage', 0, 100, 40, { fmt: pct }),
    ],
    render(E, inp, p) {
      const g = filmGrade(E, inp, STOCKS.instax, { str: p.str / 100, halo: 0.25, vig: (p.vig / 100) * 0.6, grain: (p.grain / 100) * 0.12, gsize: 1.3 });
      const f = INSTAX[p.format], a = f.img[0] / f.img[1];
      let cw = inp.w, ch = inp.h;
      if (inp.w / inp.h > a) cw = inp.h * a; else ch = inp.w / a;
      let mm = cw / f.img[0];
      mm = Math.min(mm, E.maxTex / Math.max(...f.card));
      const out = E.target(Math.round(f.card[0] * mm), Math.round(f.card[1] * mm));
      E.draw('card', out, { u_src: g, u_col: hex(p.frame), u_sc: [cw / inp.w, ch / inp.h], u_so: [(1 - cw / inp.w) / 2, (1 - ch / inp.h) / 2], u_rect: [(f.card[0] - f.img[0]) / 2 / f.card[0], f.top / f.card[1], f.img[0] / f.card[0], f.img[1] / f.card[1]] });
      E.release(g);
      return out;
    },
  },
  poly: {
    name: 'Diptyque / Triptyque', group: 'Pellicule', hint: 'Assembler ou découper en 2 ou 3 volets',
    params: [
      { k: 'count', label: 'Volets', type: 'select', def: '2', options: [['2', 'Diptyque'], ['3', 'Triptyque']] },
      { k: 'mode', label: 'Mode', type: 'select', def: 'extend', options: [['extend', 'Assembler'], ['split', 'Découper l’image']] },
      { k: 'dir', label: 'Disposition', type: 'select', def: 'h', options: [['h', 'Côte à côte'], ['v', 'Empilés']] },
      { k: 'img', label: 'Volet 2', type: 'image', slot: ':1' },
      { k: 'img2', label: 'Volet 3', type: 'image', slot: ':2', when: (p) => p.count === '3' },
      R('gap', 'Espace', 0, 100, 30, { fmt: pct }),
      { k: 'frame', label: 'Marge autour', type: 'toggle', def: true },
      { k: 'col', label: 'Couleur du fond', type: 'color', def: '#f4f2ec' },
      R('var', 'Variation de cadrage', 0, 100, 0, { fmt: pct }),
      R('seed', 'Variante', 1, 20, 1),
    ],
    render(E, inp, p, L) {
      const n = +p.count, horiz = p.dir === 'h', split = p.mode === 'split';
      const i1 = E.assets.get(L.id + ':1'), i2 = n === 3 ? E.assets.get(L.id + ':2') : null;
      let g = (p.gap / 100) * 0.06 * Math.max(inp.w, inp.h), m = p.frame ? g : 0, w, h, ps;
      if (split) { w = inp.w; h = inp.h; ps = ((horiz ? w : h) - 2 * m - (n - 1) * g) / n; }
      else {
        let k = 1; ps = horiz ? inp.w : inp.h;
        w = horiz ? n * inp.w + (n - 1) * g + 2 * m : inp.w + 2 * m; h = horiz ? inp.h + 2 * m : n * inp.h + (n - 1) * g + 2 * m;
        if (Math.max(w, h) > E.maxTex) { k = E.maxTex / Math.max(w, h); w *= k; h *= k; g *= k; m *= k; ps *= k; }
        w = Math.round(w); h = Math.round(h);
      }
      const cross = (horiz ? h : w) - 2 * m, out = E.target(w, h);
      E.draw('poly', out, { u_src: inp, u_i1: i1 || inp, u_i2: i2 || inp, u_has1: i1 ? 1 : 0, u_has2: i2 ? 1 : 0, u_a0: inp.w / inp.h, u_a1: i1 ? i1.w / i1.h : 1, u_a2: i2 ? i2.w / i2.h : 1,
        u_n: n, u_dir: horiz ? 0 : 1, u_g: g, u_m: m, u_ps: ps, u_pa: horiz ? ps / cross : cross / ps, u_var: p.var / 100, u_seed: p.seed, u_split: split ? 1 : 0, u_col: hex(p.col) });
      return out;
    },
  },
  select: {
    name: 'Teinte sélective', group: 'Couleur', hint: 'Colorer la peau, les lumières ou les ombres',
    params: [
      { k: 'target', label: 'Cible', type: 'select', def: 'skin', options: [['skin', 'Peau'], ['hi', 'Hautes lumières'], ['sh', 'Ombres']] },
      { k: 'col', label: 'Couleur', type: 'color', def: '#ff1e0a' },
      R('tol', 'Tolérance', 0, 100, 50, { fmt: pct }),
      R('int', 'Intensité', 0, 100, 90, { fmt: pct }),
    ],
    render: (E, inp, p) => E.pass('select', inp, { u_col: hex(p.col), u_target: ['skin', 'hi', 'sh'].indexOf(p.target), u_tol: p.tol / 100, u_int: p.int / 100 }),
  },
  serig: {
    name: 'Sérigraphie', group: 'Couleur', hint: 'Aplats de couleur à seuil, façon négatif',
    params: [
      { k: 'a', label: 'Fond', type: 'color', def: '#d9211c' },
      { k: 'b', label: 'Sujet', type: 'color', def: '#fbe6ea' },
      R('thr', 'Seuil', 0, 100, 45, { fmt: pct }),
      R('soft', 'Douceur', 0, 100, 10, { fmt: pct }),
      R('detail', 'Détail', 0, 100, 35, { fmt: pct }),
      { k: 'inv', label: 'Inverser', type: 'toggle', def: false },
    ],
    render: (E, inp, p) => E.pass('serig', inp, { u_a: hex(p.a), u_b: hex(p.b), u_thr: p.thr / 100, u_soft: (p.soft / 100) * 0.3, u_detail: p.detail / 100, u_inv: p.inv ? 1 : 0 }),
  },
  tone: {
    name: 'Réglages', group: 'Couleur', hint: 'Exposition, contraste, saturation',
    params: [
      R('exp', 'Exposition', -100, 100, 0, { fmt: (v) => (v / 50).toFixed(1) }),
      R('con', 'Contraste', -50, 100, 0, { fmt: pct }),
      R('sat', 'Saturation', 0, 200, 100, { fmt: pct }),
      R('temp', 'Température', -100, 100, 0, { fmt: pct }),
      R('tint', 'Teinte', -100, 100, 0, { fmt: pct }),
      R('hue', 'Rotation des couleurs', -180, 180, 0, { fmt: deg }),
      R('fade', 'Noirs délavés', 0, 100, 0, { fmt: pct }),
      R('vig', 'Vignettage', 0, 100, 0, { fmt: pct }),
    ],
    render: (E, inp, p) => E.pass('tone', inp, { u_exp: p.exp / 50, u_con: p.con / 100, u_sat: p.sat / 100, u_temp: p.temp / 100, u_tint: p.tint / 100, u_hue: rad(p.hue), u_fade: p.fade / 100, u_vig: (p.vig / 100) * 0.8 }),
  },
  duotone: {
    name: 'Bichromie', group: 'Couleur', hint: 'Deux couleurs : ombres et lumières',
    params: [
      { k: 'a', label: 'Ombres', type: 'color', def: '#1d1c1a' },
      { k: 'b', label: 'Lumières', type: 'color', def: '#ff2fa0' },
      R('con', 'Contraste', -50, 150, 30, { fmt: pct }),
      R('bri', 'Luminosité', -50, 50, 0, { fmt: pct }),
    ],
    render: (E, inp, p) => E.pass('duotone', inp, { u_a: hex(p.a), u_b: hex(p.b), u_con: p.con / 100, u_bri: p.bri / 100 }),
  },
  gel: {
    name: 'Gélatines', group: 'Couleur', hint: 'Lumières colorées en dégradé',
    params: [
      { k: 'a', label: 'Couleur A', type: 'color', def: '#1f3cff' },
      { k: 'b', label: 'Couleur B', type: 'color', def: '#19e68c' },
      { k: 'mode', label: 'Fusion', type: 'select', def: 'light', options: [['light', 'Lumière colorée'], ['soft', 'Lumière douce'], ['screen', 'Écran'], ['multiply', 'Produit'], ['overlay', 'Incrustation']] },
      R('int', 'Intensité', 0, 100, 80, { fmt: pct }),
      R('angle', 'Angle', -180, 180, 0, { fmt: deg }),
      R('spread', 'Étendue', 2, 100, 60, { fmt: pct }),
      R('pos', 'Position', -50, 50, 0, { fmt: pct }),
    ],
    render: (E, inp, p) => E.pass('gel', inp, { u_a: hex(p.a), u_b: hex(p.b), u_mode: ['light', 'soft', 'screen', 'multiply', 'overlay'].indexOf(p.mode), u_int: p.int / 100, u_angle: rad(p.angle), u_spread: p.spread / 100, u_pos: p.pos / 100 }),
  },
  raster: {
    name: 'Raster lumineux', group: 'Écran', hint: 'Photo tracée en lignes, tirets ou points de phosphore',
    params: [
      { k: 'style', label: 'Tracé', type: 'select', def: 'line', options: [['line', 'Lignes'], ['dash', 'Tirets'], ['dot', 'Points']] },
      R('lines', 'Densité', 20, 220, 90, { fmt: String }),
      R('angle', 'Angle', -90, 90, 0, { fmt: deg }),
      R('gain', 'Épaisseur', 10, 100, 70, { fmt: pct }),
      R('bri', 'Luminosité', -50, 50, 0, { fmt: pct }),
      R('lo', 'Seuil du noir', 0, 80, 12, { fmt: pct }),
      R('rel', 'Relief', 0, 100, 30, { fmt: pct }),
      R('wave', 'Ondulation', 0, 100, 0, { fmt: pct }),
      { k: 'cmode', label: 'Couleur', type: 'select', def: 'mono', options: [['mono', 'Phosphore'], ['src', 'Couleurs d’origine']] },
      { k: 'col', label: 'Teinte du phosphore', type: 'color', def: '#1fa7ff', when: (p) => p.cmode === 'mono' },
      R('bg', 'Fond', 0, 100, 12, { fmt: pct }),
      R('glow', 'Halo', 0, 100, 60, { fmt: pct }),
      { k: 'inv', label: 'Inverser', type: 'toggle', def: false },
    ],
    render(E, inp, p) {
      const out = E.pass('raster', inp, { u_col: hex(p.col), u_angle: rad(p.angle), u_lines: p.lines, u_gain: p.gain / 100, u_lo: p.lo / 100, u_rel: p.rel / 100, u_wave: p.wave / 100, u_style: ['line', 'dash', 'dot'].indexOf(p.style), u_cmode: p.cmode === 'mono' ? 0 : 1, u_bg: p.bg / 100, u_inv: p.inv ? 1 : 0, u_bri: p.bri / 100 });
      return p.glow > 0 ? bloom(E, out, p.glow / 100, 0.2) : out;
    },
  },
  crt: {
    name: 'Scanlines', group: 'Écran', hint: 'Écran cathodique : lignes, masque RVB, courbure',
    params: [
      { k: 'dir', label: 'Sens', type: 'select', def: 'h', options: [['h', 'Horizontales'], ['v', 'Verticales']] },
      R('lines', 'Lignes', 100, 900, 420, { fmt: String }),
      R('str', 'Intensité', 0, 100, 65, { fmt: pct }),
      R('mask', 'Masque RVB', 0, 100, 35, { fmt: pct }),
      R('curv', 'Courbure', 0, 100, 25, { fmt: pct }),
      R('roll', 'Barre de balayage', 0, 100, 0, { fmt: pct }),
      R('rpos', 'Position de la barre', 0, 100, 40, { fmt: pct, when: (p) => p.roll > 0 }),
      R('vig', 'Vignettage', 0, 100, 30, { fmt: pct }),
      R('glow', 'Halo', 0, 100, 35, { fmt: pct }),
    ],
    render(E, inp, p) {
      const out = E.pass('crt', inp, { u_vert: p.dir === 'v' ? 1 : 0, u_lines: p.lines, u_str: p.str / 100, u_mask: p.mask / 100, u_curv: p.curv / 100, u_roll: p.roll / 100, u_rpos: p.rpos / 100, u_vig: (p.vig / 100) * 0.8 });
      return p.glow > 0 ? bloom(E, out, p.glow / 100, 0.35) : out;
    },
  },
  vhs: {
    name: 'VHS', group: 'Écran', hint: 'Bande magnétique : bavure, bruit, instabilité',
    params: [
      R('chroma', 'Décalage des couleurs', 0, 100, 45, { fmt: pct }),
      R('soft', 'Bavure', 0, 100, 40, { fmt: pct }),
      R('ring', 'Contours', 0, 100, 35, { fmt: pct }),
      R('jit', 'Instabilité', 0, 100, 35, { fmt: pct }),
      R('tear', 'Bande de défilement', 0, 100, 50, { fmt: pct }),
      R('noise', 'Bruit', 0, 100, 35, { fmt: pct }),
      R('drop', 'Traînées blanches', 0, 100, 15, { fmt: pct }),
      R('fade', 'Noirs délavés', 0, 100, 35, { fmt: pct }),
      R('sat', 'Saturation', 0, 200, 95, { fmt: pct }),
      R('seed', 'Variante', 1, 20, 1),
    ],
    render: (E, inp, p) => E.pass('vhs', inp, { u_chroma: p.chroma / 100, u_soft: p.soft / 100, u_ring: p.ring / 100, u_jit: p.jit / 100, u_tear: p.tear / 100, u_noise: p.noise / 100, u_drop: p.drop / 100, u_fade: p.fade / 100, u_sat: p.sat / 100, u_seed: p.seed }),
  },
  glitch: {
    name: 'Glitch', group: 'Écran', hint: 'Tranches décalées avec traînée',
    params: [
      { k: 'dir', label: 'Sens', type: 'select', def: 'h', options: [['h', 'Horizontal'], ['v', 'Vertical']] },
      R('n', 'Tranches', 4, 90, 24, { fmt: String }),
      R('amt', 'Décalage', 0, 100, 35, { fmt: pct }),
      R('prob', 'Densité', 5, 100, 45, { fmt: pct }),
      R('soft', 'Traînée', 0, 100, 40, { fmt: pct }),
      R('chroma', 'Séparation RVB', 0, 100, 25, { fmt: pct }),
      R('seed', 'Variante', 1, 20, 1),
    ],
    render: (E, inp, p) => E.pass('glitch', inp, { u_vert: p.dir === 'v' ? 1 : 0, u_n: p.n, u_amt: (p.amt / 100) * 0.25, u_prob: p.prob / 100, u_soft: p.soft / 100, u_chroma: p.chroma / 100, u_seed: p.seed }),
  },
  thermal: {
    name: 'Fausses couleurs', group: 'Couleur', hint: 'Palette par niveaux de lumière, façon thermique',
    params: [
      { k: 'pal', label: 'Palette', type: 'select', def: 'rainbow', options: [['rainbow', 'Arc-en-ciel'], ['aurora', 'Aurore'], ['fire', 'Thermique']] },
      R('steps', 'Paliers', 2, 33, 9, { fmt: (v) => (v > 32 ? 'Continu' : String(v)) }),
      R('dither', 'Tramage', 0, 100, 60, { fmt: pct }),
      R('con', 'Contraste', -50, 100, 20, { fmt: pct }),
      R('shift', 'Décalage de palette', 0, 100, 0, { fmt: pct, when: (p) => p.pal !== 'fire' }),
      R('mix', 'Intensité', 0, 100, 85, { fmt: pct }),
    ],
    render: (E, inp, p) => E.pass('thermal', inp, { u_pal: ['rainbow', 'aurora', 'fire'].indexOf(p.pal), u_steps: p.steps, u_dither: p.dither / 100, u_con: p.con / 100, u_shift: p.shift / 100, u_mix: p.mix / 100 }),
  },
  double: {
    name: 'Double exposition', group: 'Matière', hint: 'Superposer une seconde image',
    params: [
      { k: 'img', label: 'Image', type: 'image' },
      { k: 'mode', label: 'Fusion', type: 'select', def: 'screen', options: [['screen', 'Écran'], ['lighten', 'Éclaircir'], ['multiply', 'Produit'], ['overlay', 'Incrustation'], ['normal', 'Fondu']] },
      R('int', 'Intensité', 0, 100, 85, { fmt: pct }),
      R('scale', 'Échelle', 50, 300, 100, { fmt: (v) => `${v}%` }),
      R('x', 'Position X', -100, 100, 0, { fmt: pct }),
      R('y', 'Position Y', -100, 100, 0, { fmt: pct }),
      R('desat', 'Désaturer', 0, 100, 0, { fmt: pct }),
      { k: 'flip', label: 'Miroir', type: 'toggle', def: false },
    ],
    render(E, inp, p, L) {
      const img = E.assets.get(L.id);
      if (!img) return inp;
      return E.pass('double', inp, { u_img: img, u_ia: img.w / img.h, u_scale: p.scale / 100, u_off: [p.x / 200, p.y / 200], u_flipx: p.flip ? 1 : 0, u_mode: ['screen', 'lighten', 'multiply', 'overlay', 'normal'].indexOf(p.mode), u_int: p.int / 100 * (p.mode === 'normal' ? 2 : 1), u_desat: p.desat / 100 });
    },
  },
  texture: {
    name: 'Texture', group: 'Matière', hint: 'Papier, poussière, rayures, fuite de lumière, plis, toile, verre cannelé',
    params: [
      { k: 'type', label: 'Type', type: 'select', def: 'paper', options: [['paper', 'Papier'], ['dust', 'Poussière & rayures'], ['leak', 'Fuite de lumière'], ['fold', 'Plis'], ['canvas', 'Toile'], ['glass', 'Verre cannelé'], ['scratch', 'Rayures de film']] },
      R('amt', 'Intensité', 0, 100, 55, { fmt: pct }),
      R('scale', 'Échelle', 30, 300, 100, { fmt: (v) => `${v}%` }),
      R('angle', 'Angle', -180, 180, 0, { fmt: deg, when: (p) => p.type === 'leak' || p.type === 'glass' }),
      { k: 'col', label: 'Couleur', type: 'color', def: '#ff6a1a', when: (p) => p.type === 'leak' },
      R('seed', 'Variante', 1, 20, 1),
    ],
    render: (E, inp, p) => E.pass('texture', inp, { u_type: TEX.indexOf(p.type), u_amt: p.amt / 100, u_scale: p.scale / 100, u_angle: rad(p.angle), u_seed: p.seed, u_col: hex(p.col) }),
  },
  grain: {
    name: 'Grain', group: 'Matière', hint: 'Grain argentique',
    params: [
      R('amt', 'Quantité', 0, 100, 35, { fmt: pct }),
      R('size', 'Taille', 5, 40, 12, { fmt: (v) => (v / 10).toFixed(1) }),
      R('col', 'Couleur', 0, 100, 30, { fmt: pct }),
    ],
    render: (E, inp, p) => E.pass('grain', inp, { u_amt: (p.amt / 100) * 0.3, u_size: p.size / 10, u_col: p.col / 100 }),
  },
};

const ZONES = ['all', 'left', 'right', 'top', 'bottom', 'center', 'edges'];

export function defaults(fx) {
  const p = {};
  for (const d of FX[fx].params) if (d.type !== 'image') p[d.k] = d.def;
  return p;
}

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 indisponible');
    this.gl = gl;
    this.float = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
    this.low = false;
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.progs = {}; this.pool = new Map(); this.assets = new Map(); this.src = null;
    const vs = this.shader(gl.VERTEX_SHADER, VERT); this.vs = vs;
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  }
  shader(type, src) {
    const gl = this.gl, s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  prog(name) {
    if (this.progs[name]) return this.progs[name];
    const gl = this.gl, p = gl.createProgram();
    gl.attachShader(p, this.vs);
    try { gl.attachShader(p, this.shader(gl.FRAGMENT_SHADER, HEAD + S[name])); } catch (e) { throw new Error(`shader ${name}: ${e.message}`); }
    gl.bindAttribLocation(p, 0, 'a'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`link ${name}: ${gl.getProgramInfoLog(p)}`);
    return (this.progs[name] = { p, u: {} });
  }
  texture(w, h, data, float) {
    const gl = this.gl, tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (data) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data);
    else if (float) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return tex;
  }
  target(w, h) {
    const float = this.float && !this.low, key = `${w}x${h}x${float}`;
    const list = this.pool.get(key);
    if (list && list.length) return list.pop();
    const gl = this.gl, tex = this.texture(w, h, null, float), fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Mémoire graphique insuffisante');
    return { tex, fbo, w, h, key };
  }
  release(t) {
    if (!t || !t.key) return;
    if (!this.pool.has(t.key)) this.pool.set(t.key, []);
    this.pool.get(t.key).push(t);
  }
  purge() {
    const gl = this.gl;
    for (const list of this.pool.values()) for (const t of list) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
    this.pool.clear();
  }
  clear(t) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  }
  draw(name, tgt, uniforms, blend) {
    const gl = this.gl, P = this.prog(name);
    gl.useProgram(P.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, tgt ? tgt.fbo : null);
    const w = tgt ? tgt.w : this.canvas.width, h = tgt ? tgt.h : this.canvas.height;
    gl.viewport(0, 0, w, h);
    const all = { u_res: [w, h], u_unit: Math.max(w, h), u_flip: 0, ...uniforms };
    let unit = 0;
    for (const k in all) {
      const loc = k in P.u ? P.u[k] : (P.u[k] = gl.getUniformLocation(P.p, k));
      if (!loc) continue;
      const v = all[k];
      if (typeof v === 'number') gl.uniform1f(loc, v);
      else if (Array.isArray(v)) gl[`uniform${v.length}f`](loc, ...v);
      else { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, v.tex); gl.uniform1i(loc, unit++); }
    }
    if (blend) { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); } else gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  // Passe plein format : même taille que l'entrée.
  pass(name, inp, uniforms) {
    const t = this.target(inp.w, inp.h);
    this.draw(name, t, { u_src: inp, ...uniforms });
    return t;
  }
  // Flou gaussien : réduit par moitiés puis passe séparable. full=true renvoie à la taille d'entrée.
  blur(inp, sigma, full) {
    let cur = inp, s = sigma;
    while (s > 4 && Math.min(cur.w, cur.h) > 32) {
      const t = this.target(Math.ceil(cur.w / 2), Math.ceil(cur.h / 2));
      this.draw('copy', t, { u_src: cur });
      if (cur !== inp) this.release(cur);
      cur = t; s /= 2;
    }
    const a = this.pass('gauss', cur, { u_d: [1, 0], u_sigma: s });
    let b = this.pass('gauss', a, { u_d: [0, 1], u_sigma: s });
    this.release(a); if (cur !== inp) this.release(cur);
    if (full && (b.w !== inp.w || b.h !== inp.h)) {
      const f = this.target(inp.w, inp.h); this.draw('copy', f, { u_src: b }); this.release(b); b = f;
    }
    return b;
  }
  upload(bitmap) {
    return { tex: this.texture(0, 0, bitmap), w: bitmap.width, h: bitmap.height };
  }
  // Texture issue d'un canvas 2D (texte, cadres), gardée en cache par clé.
  cached(key, make) {
    this.texCache ||= new Map();
    if (!this.texCache.has(key)) {
      if (this.texCache.size > 3) { for (const t of this.texCache.values()) this.drop(t); this.texCache.clear(); }
      this.texCache.set(key, this.upload(make()));
    }
    return this.texCache.get(key);
  }
  drop(t) { if (t) this.gl.deleteTexture(t.tex); }
  setSource(bitmap) { this.drop(this.src); this.src = this.upload(bitmap); }
  setAsset(id, bitmap) { /* id : identifiant du calque, suivi d'un emplacement éventuel */ this.drop(this.assets.get(id)); this.assets.set(id, this.upload(bitmap)); }

  // Recadrage centré d'après le format du premier calque « Moyen format » actif.
  static crop(layers, w, h) {
    const L = layers.find((l) => l.on && (l.fx === 'medium' || l.fx === 'film35') && l.p.format !== 'orig');
    if (!L) return { w, h, off: [0, 0], scale: [1, 1] };
    let r = FORMATS[L.p.format]; if (h > w) r = 1 / r;
    let cw = w, ch = h;
    if (w / h > r) cw = Math.round(h * r); else ch = Math.round(w / r);
    return { w: cw, h: ch, off: [(w - cw) / 2 / w, (h - ch) / 2 / h], scale: [cw / w, ch / h] };
  }

  render(layers, before) {
    const src = this.src; if (!src) return;
    const c = Engine.crop(layers, src.w, src.h);
    let cur = this.target(c.w, c.h);
    this.draw('crop', cur, { u_src: src, u_off: c.off, u_scale: c.scale });
    if (!before) for (const L of layers) {
      if (!L.on) continue;
      let out = FX[L.fx].render(this, cur, L.p, L);
      if (out === cur) continue;
      if ((L.opacity < 1 || L.zone !== 'all') && out.w === cur.w && out.h === cur.h) {
        const m = this.pass('mix', cur, { u_fx: out, u_op: L.opacity, u_zone: ZONES.indexOf(L.zone), u_zpos: L.zpos, u_zfe: L.zfe * 0.5, u_pt: L.pt });
        this.release(out); out = m;
      }
      this.release(cur); cur = out;
    }
    if (this.canvas.width !== cur.w || this.canvas.height !== cur.h) { this.canvas.width = cur.w; this.canvas.height = cur.h; }
    this.draw('blit', null, { u_src: cur, u_flip: 1 });
    this.release(cur);
  }

  // Rendu pleine résolution vers un Blob. Restaure ensuite l'aperçu.
  async export(bitmap, layers, type, quality) {
    const preview = this.src;
    this.purge();
    this.low = bitmap.width * bitmap.height > 12e6;
    try {
      this.src = this.upload(bitmap);
      this.render(layers, false);
      this.gl.finish();
      const blob = await new Promise((r) => this.canvas.toBlob(r, type, quality));
      if (!blob) throw new Error('Export impossible');
      return blob;
    } finally {
      if (this.src !== preview) this.drop(this.src);
      this.src = preview; this.low = false; this.purge();
    }
  }
}
