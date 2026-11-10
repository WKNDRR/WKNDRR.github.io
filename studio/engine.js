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

S.ghost = `uniform float u_count,u_dist,u_angle,u_scale,u_rot,u_decay,u_mode;
void main(){ vec2 dir=vec2(cos(u_angle),sin(u_angle)); vec3 acc=vec3(0.0); float ws=0.0;
  vec3 base=texture(u_src,v_uv).rgb; if(u_mode==1.0||u_mode==2.0) acc=vec3(0.0); if(u_mode==3.0) acc=vec3(1.0);
  for(int i=0;i<8;i++){ float k=float(i); if(k>=u_count) break;
    vec2 p=(v_uv-0.5)*u_res; p-=dir*u_dist*u_unit*k; float a=-u_rot*k; p=mat2(cos(a),-sin(a),sin(a),cos(a))*p;
    p/=pow(u_scale,k); vec2 uv=p/u_res+0.5;
    vec2 e=smoothstep(vec2(0.0),vec2(0.02),uv)*smoothstep(vec2(0.0),vec2(0.02),1.0-uv);
    float w=pow(u_decay,k)*e.x*e.y; vec3 c=texture(u_src,uv).rgb;
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

S.isolate = `uniform sampler2D u_wide; uniform float u_keep;
void main(){ vec3 c=texture(u_src,v_uv).rgb; vec3 w=texture(u_wide,v_uv).rgb; float a=max(w.r,max(w.g,w.b));
  o=vec4(c*mix(1.0,1.0-smoothstep(0.03,0.16,a),u_keep),1.0); }`;

S.glowmix = `uniform sampler2D u_glow; uniform float u_int; uniform vec3 u_tint;
void main(){ vec3 c=texture(u_src,v_uv).rgb; vec3 g=texture(u_glow,v_uv).rgb*u_tint*u_int;
  o=vec4(1.0-(1.0-c)*(1.0-clamp(g,0.0,1.0)),1.0); }`;

S.streak = `uniform vec2 u_dir; uniform float u_step,u_att;
void main(){ vec3 acc=vec3(0.0); for(int i=0;i<4;i++){ float s=float(i);
    acc+=pow(u_att,s)*texture(u_src,v_uv+u_dir*u_step*s/u_res).rgb; } o=vec4(acc,1.0); }`;
S.starmix = `uniform sampler2D u_star; uniform float u_int; uniform vec3 u_tint;
void main(){ vec3 c=texture(u_src,v_uv).rgb; vec3 s=texture(u_star,v_uv).rgb*u_int*u_tint;
  s=s/(1.0+s*0.35); o=vec4(c+s*(1.0-c*0.5),1.0); }`;

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

S.mfgrade = `uniform sampler2D u_hal; uniform float u_halo,u_str,u_sat,u_con,u_gamma,u_vig,u_grain,u_border,u_bw;
uniform vec3 u_lift,u_sh,u_hi,u_green;
void main(){ vec2 m=vec2(u_bw*u_unit)/u_res; vec2 uv=(v_uv-m)/(1.0-2.0*m);
  vec3 c=clamp(texture(u_src,uv).rgb,0.0,1.0);
  vec3 h=texture(u_hal,uv).rgb; c+=vec3(1.0,0.32,0.12)*max(h.r,h.g)*u_halo*(1.0-c);
  vec3 g=c; g=mix(g,g*g*(3.0-2.0*g),u_con); g=pow(g,vec3(u_gamma));
  float l=luma(g); g=mix(vec3(l),g,u_sat);
  float gm=clamp((g.g-max(g.r,g.b))*3.0,0.0,1.0); g+=u_green*gm;
  g+=u_sh*(1.0-l)*(1.0-l)+u_hi*l*l; g=g*(1.0-u_lift)+u_lift;
  g=1.0-(1.0-g)*(1.0-0.04*smoothstep(0.7,1.0,l)); g=min(g,vec3(0.985))+max(g-0.985,0.0)*0.3;
  c=mix(c,g,u_str); c*=vig(uv,u_vig); c=addGrain(c,v_uv*u_res,u_grain,1.15,0.35);
  if(u_border>0.0){ vec2 q=abs(uv-0.5)*u_res-0.5*u_res+u_unit*0.004; float d=length(max(q,0.0))-u_unit*0.004;
    float k=smoothstep(-1.0,1.0,d/(u_unit/1800.0));
    vec3 bc=u_border==1.0?vec3(0.965,0.96,0.945):vec3(0.035,0.033,0.03); bc+=grainN(v_uv*u_res,1.2,0.0)*0.012;
    c=mix(c,bc,k); }
  o=vec4(c,1.0); }`;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const rad = (d) => (d * Math.PI) / 180;

export const SHUTTER = ['1/500', '1/250', '1/125', '1/60', '1/30', '1/15', '1/8', '1/4', '1/2', '1″', '2″'];
const SHUTTER_T = [1 / 500, 1 / 250, 1 / 125, 1 / 60, 1 / 30, 1 / 15, 1 / 8, 1 / 4, 1 / 2, 1, 2];

export const FORMATS = { orig: 0, '645': 4 / 3, '66': 1, '67': 5 / 4, '69': 3 / 2, xpan: 65 / 24 };

const STOCKS = {
  warm: { sat: 0.93, con: 0.18, gamma: 0.95, lift: [0.035, 0.03, 0.026], sh: [-0.012, 0.008, 0.016], hi: [0.032, 0.012, -0.022], green: [0.035, -0.01, -0.02] },
  cool: { sat: 0.84, con: 0.1, gamma: 0.9, lift: [0.045, 0.05, 0.05], sh: [-0.016, 0.014, 0.012], hi: [-0.004, 0.012, 0.01], green: [-0.035, 0.0, 0.03] },
  vivid: { sat: 1.24, con: 0.42, gamma: 1.02, lift: [0.008, 0.008, 0.01], sh: [-0.008, 0.0, 0.014], hi: [0.02, 0.006, -0.012], green: [0.0, 0.02, -0.01] },
  bw: { sat: 0, con: 0.38, gamma: 0.98, lift: [0.022, 0.022, 0.022], sh: [0, 0, 0], hi: [0.008, 0.004, -0.004], green: [0, 0, 0] },
  neutral: { sat: 1, con: 0.1, gamma: 1, lift: [0.012, 0.012, 0.012], sh: [0, 0, 0], hi: [0, 0, 0], green: [0, 0, 0] },
};

const R = (k, label, min, max, def, extra = {}) => ({ k, label, type: 'range', min, max, step: 1, def, ...extra });
const deg = (v) => `${v}°`;
const pct = (v) => `${v}`;

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
      { k: 'mode', label: 'Fusion', type: 'select', def: 'avg', options: [['avg', 'Moyenne'], ['lighten', 'Éclaircir'], ['screen', 'Écran'], ['darken', 'Assombrir']] },
    ],
    render: (E, inp, p) => E.pass('ghost', inp, { u_count: p.count, u_dist: (p.dist / 100) * 0.3, u_angle: rad(p.angle), u_scale: p.scale / 100, u_rot: rad(p.rot), u_decay: p.decay / 100, u_mode: ['avg', 'lighten', 'screen', 'darken'].indexOf(p.mode) }),
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
  star: {
    name: 'Filtre étoile', group: 'Optique', hint: 'Éclats sur les hautes lumières',
    params: [
      R('points', 'Branches', 4, 12, 6, { step: 2 }),
      R('len', 'Longueur', 0, 100, 45, { fmt: pct }),
      R('thr', 'Seuil', 30, 99, 85, { fmt: pct }),
      R('int', 'Intensité', 0, 100, 45, { fmt: pct }),
      R('rot', 'Rotation', 0, 90, 15, { fmt: deg }),
      R('small', 'Points lumineux seuls', 0, 100, 85, { fmt: pct }),
      { k: 'tint', label: 'Teinte', type: 'color', def: '#ffffff' },
    ],
    render(E, inp, p) {
      const s = Math.min(1, 1400 / Math.max(inp.w, inp.h));
      const w = Math.max(2, Math.round(inp.w * s)), h = Math.max(2, Math.round(inp.h * s));
      const raw = E.target(w, h);
      E.draw('bright', raw, { u_src: inp, u_thr: p.thr / 100, u_px: 1 / s, u_luma: 1 });
      const wide = E.blur(raw, 0.02 * Math.max(w, h));
      const br = E.pass('isolate', raw, { u_wide: wide, u_keep: p.small / 100 });
      E.release(raw); E.release(wide);
      const acc = E.target(w, h); E.clear(acc);
      const lenPx = (p.len / 100) * 0.3 * Math.max(w, h) + 1, att = Math.pow(0.01, 1 / 256);
      for (let i = 0; i < p.points; i++) {
        const ang = rad(p.rot) + (i * 2 * Math.PI) / p.points;
        let a = br;
        for (let k = 0; k < 4; k++) {
          const t = E.target(w, h), b = 4 ** k;
          E.draw('streak', t, { u_src: a, u_dir: [Math.cos(ang), Math.sin(ang)], u_step: (lenPx / 256) * b, u_att: Math.pow(att, b) });
          if (a !== br) E.release(a);
          a = t;
        }
        E.draw('copy', acc, { u_src: a }, true); E.release(a);
      }
      const out = E.pass('starmix', inp, { u_star: acc, u_int: (p.int / 100) * 0.5, u_tint: hex(p.tint) });
      E.release(br); E.release(acc);
      return out;
    },
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
      const br = E.target(Math.ceil(inp.w / 2), Math.ceil(inp.h / 2));
      E.draw('bright', br, { u_src: cur, u_thr: 0.72, u_px: 2 });
      const hal = E.blur(br, 0.006 * unit); E.release(br);
      const st = STOCKS[p.stock];
      const border = ['none', 'white', 'black'].indexOf(p.border);
      const out = E.pass('mfgrade', cur, { u_hal: hal, u_halo: (p.halo / 100) * 0.9, u_str: p.str / 100, u_sat: st.sat, u_con: st.con, u_gamma: st.gamma, u_lift: st.lift, u_sh: st.sh, u_hi: st.hi, u_green: st.green, u_vig: (p.vig / 100) * 0.55, u_grain: (p.grain / 100) * 0.09, u_border: border, u_bw: border ? 0.035 : 0 });
      E.release(hal); if (cur !== inp) E.release(cur);
      return out;
    },
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
  drop(t) { if (t) this.gl.deleteTexture(t.tex); }
  setSource(bitmap) { this.drop(this.src); this.src = this.upload(bitmap); }
  setAsset(id, bitmap) { this.drop(this.assets.get(id)); this.assets.set(id, this.upload(bitmap)); }

  // Recadrage centré d'après le format du premier calque « Moyen format » actif.
  static crop(layers, w, h) {
    const L = layers.find((l) => l.on && l.fx === 'medium' && l.p.format !== 'orig');
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
      if (L.opacity < 1 || L.zone !== 'all') {
        const m = this.pass('mix', cur, { u_fx: out, u_op: L.opacity, u_zone: ZONES.indexOf(L.zone), u_zpos: L.zpos, u_zfe: L.zfe * 0.5, u_pt: L.pt });
        this.release(out); out = m;
      }
      this.release(cur); cur = out;
    }
    if (this.canvas.width !== c.w || this.canvas.height !== c.h) { this.canvas.width = c.w; this.canvas.height = c.h; }
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
