const { expansionRing } = require("./joinery.cjs");

const expandedDecor = ["decor-typewriter", "decor-globe", "decor-hourglass", "decor-radio", "decor-record-player", "decor-camera", "decor-tea-set", "decor-origami", "decor-succulents", "decor-pencil-cup", "decor-candles", "decor-aquarium", "decor-model-ship", "decor-desk-fan"];

function buildExpandedDecor(kit, asset, width, depth) {
  const { box, roundedBox, cylinder, ellipsoid, branch, shape, THREE } = kit;
  const id = asset.id;
  if (id === "decor-typewriter") {
    roundedBox("Typewriter chassis", [0, 4, 0], [width - 2, 8, depth - 4], "main");
    box("Keyboard deck", [0, 8, 4], [width - 6, 1, depth / 2], "shade");
    for (let row = 0; row < 3; row++) for (let col = 0; col < 7; col++) cylinder("Round typewriter key", [-10 + col * 3.2 + row % 2, 9, 1 + row * 3.5], 1, 0.7, "cream");
    cylinder("Platen", [0, 12, -8], 2.2, width - 4, "ink", 2.2, [0, 0, 90]);
    box("Loaded paper", [0, 18, -10], [18, 12, 0.4], "paper");
    for (let y = 15; y < 20; y += 2) box("Typed line", [0, y, -9.7], [10, 0.5, 0.1], "shade");
    branch("Carriage return lever", [-13, 13, -8], [-13, 16, -2], 0.7, "gold");
  } else if (id === "decor-globe") {
    cylinder("Globe base", [0, 1, 0], 10, 2, "main");
    cylinder("Globe pedestal", [0, 5, 0], 2, 8, "gold");
    ellipsoid("Globe ocean", [0, 20, 0], [11, 11, 11], "water");
    expansionRing(kit, "Globe meridian", [0, 20, 0], 12, 0.65, "gold", [0, 0, -18]);
    for (const [x, y, z, sx, sy] of [[-4,24,8,3,4],[3,18,9,3,5],[5,24,-8,4,3],[-6,17,-7,3,4]]) ellipsoid("Continent", [x,y,z], [sx,sy,1.3], "green");
    expansionRing(kit, "Equator", [0,20,0], 11.1, 0.2, "light");
  } else if (id === "decor-hourglass") {
    for (const y of [1, 24]) cylinder("Hourglass end", [0,y,0], 6.5, 2, "main");
    for (const x of [-5,5]) for (const z of [-3,3]) branch("Hourglass upright", [x,2,z], [x,23,z], 0.5, "gold");
    cylinder("Upper glass bulb", [0,18,0], 0.9, 10, "waterLight", 5);
    cylinder("Lower glass bulb", [0,8,0], 5, 10, "waterLight", 0.9);
    cylinder("Falling sand", [0,12,0], 0.25, 12, "gold");
    cylinder("Sand mound", [0,5,0], 4, 5, "gold", 0.2);
  } else if (id === "decor-radio") {
    roundedBox("Radio cabinet", [0,8,0], [width-1,16,depth-2], "main");
    roundedBox("Speaker grille", [-6,8,depth/2-0.8], [15,11,0.5], "shade");
    for(let x=-12;x<=0;x+=2) box("Speaker grille rib",[x,8,depth/2-0.4],[0.45,10,0.2],"gold");
    box("Tuner glass",[8,11,depth/2-0.5],[8,4,0.5],"waterLight");
    for(const x of [5,11]) cylinder("Radio knob",[x,5,depth/2],1.5,1.5,"gold",1.5,[90,0,0]);
    branch("Aerial",[-10,15,-3],[-5,31,-3],0.4,"gold");
  } else if (id === "decor-record-player") {
    roundedBox("Turntable cabinet", [0,4,0], [width-1,8,depth-2], "main");
    cylinder("Vinyl record",[-3,8.3,0],10,0.5,"ink");
    for(const radius of [5,7.3,9]) expansionRing(kit,"Record groove",[-3,8.65,0],radius,0.12,"shade");
    cylinder("Record label",[-3,8.7,0],3,0.2,"pink");
    cylinder("Tonearm pivot",[11,9,-9],2,2,"gold");
    branch("Tonearm",[11,10,-9],[8,10,6],0.55,"gold");
    box("Cartridge",[7.5,9.7,7],[3,2,4],"cream");
    box("Open dust cover",[0,21,-depth/2+1],[width-2,26,1],"waterLight");
  } else if (id === "decor-camera") {
    roundedBox("Camera body",[0,6,0],[15,10,8],"main");
    cylinder("Camera lens",[0,6,5],4,5,"shade",4,[90,0,0]);
    cylinder("Lens glass",[0,6,7.6],2.8,0.3,"water",2.8,[90,0,0]);
    box("Viewfinder",[0,12,0],[5,3,4],"gold");
    cylinder("Shutter button",[5,11,0],1.3,1,"gold");
  } else if (id === "decor-tea-set") {
    roundedBox("Tea tray",[0,1,0],[width-1,2,depth-1],"wood");
    ellipsoid("Teapot body",[-5,7,-4],[6,5,6],"main");
    cylinder("Teapot lid",[-5,12,-4],4,1.5,"light");
    ellipsoid("Lid finial",[-5,13,-4],[1.3,1,1.3],"gold");
    branch("Teapot spout",[0,7,-4],[5,11,-4],1.5,"main");
    expansionRing(kit,"Teapot handle",[-11,8,-4],4,0.8,"gold",[0,90,0]);
    for(const [x,z] of [[7,7],[-7,8]]) {
      cylinder("Tea saucer",[x,2.3,z],4.8,0.7,"light");
      cylinder("Tea cup",[x,4.5,z],2.4,4,"main",3.2);
      cylinder("Tea surface",[x,6.6,z],2.6,0.15,"wood");
    }
  } else if (id === "decor-origami") {
    for(const [x,z,turn] of [[-7,-3,-20],[7,5,35]]) {
      const rotation = turn*Math.PI/180;
      const points = [[0,7,0],[-9,14,-2],[-4,5,3],[0,8,0],[9,14,-2],[4,5,3],[0,7,0],[1,16,1],[3,13,3],[0,7,0],[-2,3,-7],[2,4,-5]];
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute("position",new THREE.Float32BufferAttribute(points.flatMap(([px,py,pz])=>[px*Math.cos(rotation)-pz*Math.sin(rotation),py,px*Math.sin(rotation)+pz*Math.cos(rotation)]),3));
      geometry.computeVertexNormals();
      shape("Folded paper crane",geometry,[x,0,z],x<0?"light":"main");
    }
  } else if (id === "decor-succulents") {
    for(const [index,x] of [-16,0,16].entries()) {
      cylinder("Small ceramic planter",[x,4,0],5,8,"main",6);
      cylinder("Planter soil",[x,8.2,0],5,0.4,"soil");
      for(let leaf=0;leaf<7;leaf++) {
        const angle=leaf*Math.PI*2/7;
        ellipsoid("Succulent rosette leaf",[x+Math.cos(angle)*3,10+index,Math.sin(angle)*3],[2.6,1.5+index,4],leaf%2?"green":"leafDark",[0,90-angle*180/Math.PI,0]);
      }
    }
  } else if (id === "decor-pencil-cup") {
    cylinder("Pencil cup",[0,5,0],5,10,"main");
    cylinder("Cup opening",[0,10.1,0],3.8,0.2,"shade");
    for(let i=0;i<6;i++) {
      const x=Math.cos(i)*2.7,z=Math.sin(i)*2.7;
      branch("Colored pencil",[x,5,z],[x*1.6,18+i%3*2,z*1.6],0.65,["pink","gold","green","water","cream","wood"][i]);
    }
  } else if (id === "decor-candles") {
    roundedBox("Candle tray",[0,1,0],[width-1,2,depth-1],"main");
    for(const [x,h] of [[-9,12],[0,19],[9,9]]) {
      cylinder("Pillar candle",[x,h/2+2,0],3.5,h,"cream");
      cylinder("Melted wax well",[x,h+2.1,0],2,0.2,"gold");
      ellipsoid("Candle flame",[x,h+4.8,0],[1.1,2.7,1.1],"light");
    }
  } else if (id === "decor-aquarium") {
    roundedBox("Aquarium body",[0,12,0],[width-1,24,depth-1],"water");
    box("Aquarium sand",[0,2,0],[width-3,3,depth-3],"cream");
    box("Aquarium plinth",[0,1,0],[width,2,depth],"main");
    for(const z of [-depth/2+1,depth/2-1]) box("Aquarium rim rail",[0,24,z],[width,2,2],"main");
    for(const x of [-width/2+1,width/2-1]) box("Aquarium rim end",[x,24,0],[2,2,depth],"main");
    box("Aquarium water surface",[0,24.05,0],[width-4,0.15,depth-4],"waterLight");
    for(const [x,z] of [[-11,-4],[8,6],[9,-8]]) {
      ellipsoid("Fish below water surface",[x,24.3,z],[4,0.12,1.7],"gold");
      ellipsoid("Fish tail below surface",[x-4,24.3,z],[1.8,0.12,2.2],"pink");
    }
    for(const x of [-width/2+6,width/2-6]) for(const z of [-7,0,7]) ellipsoid("Aquatic plant seen from above",[x,24.2,z],[2.4,0.15,5],"green",[0,x+z,0]);
    for(const x of [-width/2+1,width/2-1]) for(const z of [-depth/2+1,depth/2-1]) box("Glass edge",[x,12,z],[1,22,1],"waterLight");
    for(const [x,y,z] of [[-10,13,depth/2],[8,18,depth/2],[3,11,-depth/2]]) {
      ellipsoid("Goldfish",[x,y,z],[3,1.8,0.7],"gold");
      shape("Fish tail",new THREE.ConeGeometry(2,3,3),[x-4,y,z],"pink",[1,1,0.3],[0,0,90]);
    }
    for(const x of [-18,17]) for(const side of [-1,1]) branch("Aquatic leaf",[x,3,depth/2],[x+side*3,12,depth/2],0.9,"green");
    branch("Glass reflection",[-14,21,depth/2+0.7],[-7,14,depth/2+0.7],0.45,"waterLight");
    branch("Water surface reflection",[-12,24.5,-7],[1,24.5,4],0.35,"paper");
  } else if (id === "decor-model-ship") {
    roundedBox("Ship display base",[0,1,0],[width-2,2,depth/2],"main");
    ellipsoid("Sailboat hull",[0,7,0],[width/2-4,4,depth/4],"wood");
    branch("Mast",[0,7,0],[0,35,0],0.7,"gold");
    const sail=new THREE.BufferGeometry();
    sail.setAttribute("position",new THREE.Float32BufferAttribute([0,33,0,0,13,0,17,13,0,-2,29,0,-2,13,0,-15,13,0],3));
    sail.computeVertexNormals();
    shape("Canvas sails",sail,[0,0,0],"paper");
    branch("Rigging",[-18,7,0],[0,33,0],0.22,"shade");
    branch("Rigging",[18,7,0],[0,33,0],0.22,"shade");
  } else if (id === "decor-desk-fan") {
    roundedBox("Fan base",[0,1.5,2],[20,3,17],"main");
    cylinder("Fan neck",[0,9,0],1.5,15,"gold");
    expansionRing(kit,"Fan guard",[0,23,0],11,0.8,"main",[0,0,0]);
    for(let i=0;i<12;i++) {
      const a=i*Math.PI/6;
      branch("Guard spoke",[0,23,1.8],[Math.cos(a)*11,23+Math.sin(a)*11,0],0.24,"gold");
    }
    for(let i=0;i<3;i++) {const a=i*120;ellipsoid("Fan blade",[Math.cos(a*Math.PI/180)*4,23+Math.sin(a*Math.PI/180)*4,0],[6,2.4,0.6],"light",[0,0,a]);}
    cylinder("Fan hub",[0,23,2],2.3,2,"main",2.3,[90,0,0]);
  }
}

module.exports = { expandedDecor, buildExpandedDecor };
