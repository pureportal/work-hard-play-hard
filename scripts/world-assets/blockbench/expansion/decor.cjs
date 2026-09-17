const { expansionRing } = require("./joinery.cjs");

const expandedDecor = ["decor-typewriter", "decor-radio", "decor-record-player", "decor-camera", "decor-succulents", "decor-pencil-cup", "decor-candles", "decor-aquarium"];

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
  }
}

module.exports = { expandedDecor, buildExpandedDecor };
