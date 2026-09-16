const { foodPalette, foodDish, foodChopsticks, foodRice, foodTray, foodTube } = require("./food/serving.cjs");
const { asianDishes, buildAsianDish } = require("./food/asian.cjs");
const { europeanDishes, buildEuropeanDish } = require("./food/european.cjs");
const { cafeDishes, buildCafeDish } = require("./food/cafe.cjs");

const foodAssets = ["food-ramen", "food-sushi", "food-bento", "food-dim-sum", "food-curry", "food-poke", "food-pho", "food-pretzel", "food-bratwurst", "food-schnitzel", "food-burger", "food-pancakes", ...asianDishes, ...europeanDishes, ...cafeDishes];

function buildFood(kit, asset, variant, width, depth) {
  if (asianDishes.includes(asset.id)) return buildAsianDish(kit, asset, width, depth);
  if (europeanDishes.includes(asset.id)) return buildEuropeanDish(kit, asset, width, depth);
  if (cafeDishes.includes(asset.id)) return buildCafeDish(kit, asset, width, depth);
  const { box, roundedBox, cylinder, ellipsoid, branch, shape, THREE } = kit;
  const id = asset.id;
  if (["food-ramen", "food-pho", "food-poke", "food-curry"].includes(id)) {
    foodDish(kit, true);
    cylinder("Bowl filling", [0, 7.3, 0], 11.2, 0.7, id === "food-poke" || id === "food-curry" ? "rice" : "broth");
    if (id === "food-ramen" || id === "food-pho") {
      for (let i = 0; i < 8; i++) {
        const points = Array.from({ length: 9 }, (_, n) => new THREE.Vector3(-8 + n * 1.8, 8.1 + i % 2 * 0.25, -6 + i * 1.5 + Math.sin(n * 1.7 + i) * 0.7));
        shape("Curled noodle", new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 16, 0.35, 5, false), [0, 0, 0], "noodle");
      }
      if (id === "food-ramen") {
        ellipsoid("Halved soft egg", [5, 9, 4], [3.6, 1.4, 4.5], "rice");
        ellipsoid("Golden egg yolk", [5, 10.35, 4], [2, 0.3, 2.3], "yolk");
        for (const x of [-6, -1]) { ellipsoid("Chashu pork", [x, 9, -3], [3.7, 0.8, 3], "meat"); ellipsoid("Pork fat spiral", [x, 9.8, -3], [2, 0.2, 1.5], "salmon"); }
        box("Nori sheet", [-6, 11, -6], [6, 7, 0.5], "nori", [-20, -15, 0]);
      } else {
        for (let i = 0; i < 4; i++) ellipsoid("Thin beef slice", [-6 + i * 3.5, 8.8, -3 + i % 2 * 2], [3, 0.55, 2.2], "meat");
        for (let i = 0; i < 5; i++) branch("Bean sprout", [-5 + i * 2, 9, 4], [-3 + i * 2, 10, 7], 0.25, "rice");
        cylinder("Lime slice", [6, 9, 4], 3, 0.8, "lettuce");
        cylinder("Lime flesh", [6, 9.5, 4], 2.3, 0.3, "cucumber");
      }
      for (let i = 0; i < 5; i++) cylinder("Scallion ring", [-7 + i * 2.2, 10, 5 + i % 2], 0.8, 0.6, "lettuce");
      foodChopsticks(kit, 12);
    } else if (id === "food-poke") {
      for (let i = 0; i < 7; i++) roundedBox("Salmon cube", [-7 + i % 3 * 3, 9, -5 + Math.floor(i / 3) * 3], [2.7, 2.3, 2.7], "salmon");
      for (let i = 0; i < 4; i++) ellipsoid("Avocado fan", [4 + i * 0.7, 9, -4 + i * 2.2], [3, 0.7, 1.8], "cucumber", [0, -20, 0]);
      for (let i = 0; i < 6; i++) ellipsoid("Edamame", [-5 + i % 3 * 3, 9, 5 + Math.floor(i / 3) * 2], [1.4, 0.8, 1], "lettuce");
      for (let i = 0; i < 4; i++) box("Red cabbage ribbon", [6, 9 + i * 0.4, 4 + i], [5, 0.5, 0.6], "onion", [0, i * 17, 0]);
    } else {
      ellipsoid("Curry sauce", [-4, 8, 0], [6.7, 0.8, 9], "broth");
      foodRice(kit, [5, 8.3, 0], [4.8, 2.3, 8]);
      for (let i = 0; i < 5; i++) roundedBox("Curry vegetable", [-7 + i % 2 * 4, 9, -5 + i * 2.5], [2.6, 1.8, 2.4], i % 2 ? "yolk" : "vegetable");
      ellipsoid("Pickled ginger", [7, 9, 5], [2.2, 1, 2.2], "salmon");
    }
  } else if (id === "food-sushi" || id === "food-bento" || id === "food-dim-sum") {
    if (id === "food-dim-sum") {
      cylinder("Bamboo steamer", [0, 3, 0], 13, 6, "wood");
      for (const x of [-13, 13]) box("Steamer binding", [x, 3, 0], [0.5, 5, 5], "main");
      cylinder("Steamer lining", [0, 6.1, 0], 11, 0.3, "rice");
      for (const y of [1, 4.5, 6]) shape("Bamboo steamer band", new THREE.TorusGeometry(12.8, 0.65, 5, 28), [0, y, 0], y === 1 ? "toast" : "main", [1, 1, 1], [90, 0, 0]);
      for (let i = 0; i < 4; i++) {
        const x = Math.cos(i * Math.PI / 2 + 0.5) * 6.2, z = Math.sin(i * Math.PI / 2 + 0.5) * 6.2;
        cylinder("Dumpling golden base", [x, 6.8, z], 3.2, 1.2, "toast");
        ellipsoid("Pleated dumpling", [x, 8.5, z], [3.4, 2.6, 3.4], i % 2 ? "noodle" : "rice");
        for (let k = 0; k < 7; k++) {
          const a = k * Math.PI * 2 / 7;
          foodTube(kit, "Raised dumpling pleat", [[x + Math.cos(a) * 3.2, 9.5, z + Math.sin(a) * 3.2], [x + Math.cos(a) * 2.3, 10.7, z + Math.sin(a) * 2.3], [x + Math.cos(a) * 0.8, 11.35, z + Math.sin(a) * 0.8]], 0.28, "toast");
        }
        ellipsoid("Pinched dumpling top", [x, 11.3, z], [0.85, 0.65, 0.85], "rice");
      }
      foodChopsticks(kit, 12);
    } else {
      if (id === "food-sushi") {
        roundedBox("Serving tray", [0, 1, 0], [width - 2, 2, depth - 2], "shade");
        roundedBox("Tray inset", [0, 2.1, 0], [width - 5, 0.5, depth - 5], "main");
        for (let i = 0; i < 3; i++) {
          const x = -13 + i * 12;
          foodRice(kit, [x, 4, -6], [4.4, 2, 3]);
          roundedBox("Salmon nigiri", [x, 6, -6], [9, 1.8, 5.5], "salmon");
          for (let k = 0; k < 3; k++) box("Salmon marbling", [x - 3 + k * 2.5, 6.95, -6], [0.4, 0.12, 5], "rice", [0, -20, 0]);
          cylinder("Maki nori", [x, 4.5, 5], 3.8, 4, "nori");
          cylinder("Maki rice", [x, 6.55, 5], 3, 0.2, "rice");
          box("Maki filling", [x, 6.75, 5], [2, 0.4, 2], "salmon");
        }
        ellipsoid("Wasabi", [18, 3.5, -4], [2, 1.5, 2], "lettuce");
        ellipsoid("Pickled ginger", [18, 3.5, 4], [2.6, 1, 2], "salmon");
      } else {
        foodTray(kit, width, depth);
        for (const z of [-depth / 2 + 2, depth / 2 - 2]) box("Bento rim", [0, 3.3, z], [width - 3, 4, 1], "shade");
        for (const x of [-width / 2 + 2, 0, width / 2 - 2]) box("Bento divider", [x, 3.3, 0], [1, 4, depth - 3], "shade");
        box("Small compartment divider", [width / 4, 3.3, 0], [width / 2 - 2, 4, 1], "shade");
        roundedBox("Packed bento rice", [-width / 4, 4, 0], [width / 2 - 4, 3, depth - 7], "rice");
        for (let i = 0; i < 18; i++) ellipsoid("Packed rice grain", [-width / 4 - 6 + i % 5 * 3, 5.6, -8 + Math.floor(i / 5) * 5], [0.75, 0.3, 0.4], "creamFood");
        ellipsoid("Umeboshi plum", [-width / 4, 6, 0], [2, 1, 2], "vegetable");
        for (let i = 0; i < 3; i++) roundedBox("Tamagoyaki slice", [7 + i * 4, 4.5, -6], [3.2, 3.5, 8], "yolk");
        for (let i = 0; i < 3; i++) {
          cylinder("Broccoli stalk", [7 + i * 4, 4, 6], 0.8, 2.5, "cucumber");
          for (let k = 0; k < 4; k++) ellipsoid("Broccoli floret", [7 + i * 4 + Math.cos(k * 2.4) * 1.2, 5.4 + k % 2 * 0.8, 6 + Math.sin(k * 2.4) * 1.3], [1.7, 1.7, 1.7], k % 2 ? "lettuce" : "herb");
        }
      }
    }
  } else {
    foodDish(kit, false, id === "food-bratwurst" || id === "food-schnitzel" ? 14 : 13);
    if (id === "food-pretzel") {
      const points = [[-6, 4, 7], [0, 5.5, -1], [6, 4, -7], [10, 4, -5], [10, 4, 2], [6, 4, 8], [0, 4, 10], [-6, 4, 8], [-10, 4, 2], [-10, 4, -5], [-6, 4, -7], [0, 4.2, -1], [6, 4.2, 7]];
      foodTube(kit, "Twisted pretzel", points, 1.8, "crust");
      for (let i = 0; i < points.length; i++) { const p = points[i]; box("Salt crystal", [p[0], p[1] + 1.8, p[2]], [0.7, 0.4, 0.7], "rice", [0, i * 31, 0]); }
    } else if (id === "food-bratwurst") {
      for (const x of [-5, 1]) {
        ellipsoid("Grilled bratwurst", [x, 4, -1], [2.7, 2.1, 10], "toast", [0, -12, 0]);
        for (let i = 0; i < 5; i++) box("Grill mark", [x, 6.05, -7 + i * 3], [3.8, 0.15, 0.55], "meat", [0, -25, 0]);
      }
      ellipsoid("Sauerkraut", [7, 3, 2], [3.5, 1.3, 7], "noodle");
      for (let i = 0; i < 8; i++) branch("Cabbage strand", [5 + i % 3, 4.3, -3 + i], [9, 4.5, -1 + i], 0.25, "rice");
      ellipsoid("Mustard", [6, 3, -8], [2.5, 0.7, 2], "yolk");
    } else if (id === "food-schnitzel") {
      ellipsoid("Breaded schnitzel", [-3, 3.7, -1], [7.5, 1.8, 10], "crust", [0, 20, 0]);
      for (let i = 0; i < 22; i++) ellipsoid("Crisp crumb", [-3 + Math.cos(i * 2.4) * (i % 4 + 1), 5.2, Math.sin(i * 2.4) * (i % 5 + 2)], [0.6, 0.35, 0.6], i % 2 ? "toast" : "noodle");
      for (let i = 0; i < 5; i++) ellipsoid("Potato salad slice", [7 + i % 2 * 2, 3.2 + i % 2, -6 + i * 3], [2.7, 0.8, 2.2], "noodle");
      cylinder("Lemon slice", [-6, 5.5, -5], 3.3, 0.6, "yolk");
      cylinder("Lemon flesh", [-6, 5.9, -5], 2.6, 0.2, "rice");
    } else if (id === "food-burger") {
      cylinder("Bottom bun", [-4, 3.3, -1], 6.5, 2.5, "toast");
      cylinder("Burger patty", [-4, 5.5, -1], 6.8, 2.5, "sauce");
      box("Cheese slice", [-4, 6.6, -1], [11, 0.6, 11], "yolk", [0, 15, 0]);
      for (let i = 0; i < 7; i++) ellipsoid("Lettuce frill", [-4 + Math.cos(i) * 4.5, 7.5, -1 + Math.sin(i) * 4.5], [3.1, 0.6, 2.5], "lettuce");
      cylinder("Tomato", [-4, 8.5, -1], 5.6, 1, "vegetable");
      shape("Sesame bun crown", new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), [-4, 9, -1], "toast", [6.4, 3.3, 6.4]);
      cylinder("Bun underside", [-4, 9, -1], 6.4, 0.4, "crust");
      for (let i = 0; i < 10; i++) ellipsoid("Sesame seed", [-4 + Math.cos(i * 2.4) * 3.5, 11.85, -1 + Math.sin(i * 2.4) * 3.5], [0.6, 0.2, 0.25], "rice", [0, i * 30, 0]);
      for (let i = 0; i < 8; i++) box("French fry", [6 + i % 3 * 1.8, 3.5 + Math.floor(i / 3), -5 + i % 2 * 3], [1.4, 1.3, 9], "yolk", [0, -15 + i * 5, 0]);
    } else if (id === "food-pancakes") {
      for (let i = 0; i < 4; i++) {
        cylinder("Fluffy pancake", [0, 2.8 + i * 1.7, 0], 9, 1.6, "toast");
        cylinder("Golden pancake top", [0, 3.6 + i * 1.7, 0], 8.3, 0.15, "crust");
      }
      ellipsoid("Maple syrup pool", [0, 9, 0], [6, 0.35, 6], "sauce");
      roundedBox("Butter pat", [0, 10, 0], [4, 1.5, 4], "yolk");
      for (let i = 0; i < 5; i++) ellipsoid("Blueberry", [Math.cos(i * 2.4) * 7, 10, Math.sin(i * 2.4) * 7], [1.4, 1.4, 1.4], "berry");
    }
  }
}

module.exports = { foodAssets, foodPalette, buildFood };
