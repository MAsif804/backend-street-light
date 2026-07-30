// Seeds the geography tables: City ─> Cluster ─> Location.
// Idempotent — safe to re-run (upserts on the unique keys).
// For Islamabad it is also authoritative: clusters/streets not in
// ISLAMABAD_CLUSTER_MAPPING are removed so the DB matches this file exactly.
// Run with:  bun run prisma/seed-geo.ts
import { prisma } from "../src/lib/prisma";

// Cities across Pakistan (mirrors the frontend PAKISTAN_CITIES list).
const CITIES: string[] = [
  "Abbottabad", "Ahmadpur East", "Alipur", "Arifwala", "Attock", "Badin", "Bagh",
  "Bahawalnagar", "Bahawalpur", "Bannu", "Batkhela", "Bhakkar", "Bhalwal", "Bhimber",
  "Burewala", "Chakwal", "Chaman", "Charsadda", "Chichawatni", "Chiniot", "Chishtian",
  "Chitral", "Dadu", "Daska", "Dera Ghazi Khan", "Dera Ismail Khan", "Dinga", "Dir",
  "Faisalabad", "Ghotki", "Gilgit", "Gojra", "Gujar Khan", "Gujranwala", "Gujrat",
  "Gwadar", "Hafizabad", "Hangu", "Haripur", "Hasilpur", "Hub", "Hyderabad", "Islamabad",
  "Jacobabad", "Jampur", "Jamshoro", "Jaranwala", "Jhang", "Jhelum", "Kabirwala", "Kalat",
  "Kamalia", "Kamoke", "Kandhkot", "Karachi", "Karak", "Kasur", "Khairpur", "Khanewal",
  "Khanpur", "Kharian", "Khushab", "Khuzdar", "Kohat", "Kot Addu", "Kotli", "Kotri",
  "Lahore", "Lakki Marwat", "Larkana", "Layyah", "Lodhran", "Loralai", "Mandi Bahauddin",
  "Mansehra", "Mardan", "Mastung", "Matiari", "Mianwali", "Mingora", "Mirpur", "Mirpur Khas",
  "Multan", "Murree", "Muridke", "Muzaffarabad", "Muzaffargarh", "Nankana Sahib", "Narowal",
  "Naushahro Feroze", "Nawabshah", "Nowshera", "Nushki", "Okara", "Pakpattan", "Parachinar",
  "Pattoki", "Peshawar", "Pishin", "Quetta", "Rahim Yar Khan", "Rajanpur", "Rawalakot",
  "Rawalpindi", "Renala Khurd", "Sadiqabad", "Sahiwal", "Samundri", "Sanghar", "Sargodha",
  "Shakargarh", "Sheikhupura", "Shikarpur", "Sialkot", "Sibi", "Skardu", "Sukkur", "Swabi",
  "Tando Adam", "Tando Allahyar", "Tando Muhammad Khan", "Tank", "Taxila", "Thatta",
  "Timergara", "Toba Tek Singh", "Turbat", "Umerkot", "Vehari", "Wah Cantonment",
  "Wazirabad", "Zhob",
];

// Every non-Islamabad city gets these default clusters/zones (no locations yet).
const DEFAULT_CLUSTERS = ["Red Zone", "Blue Area"];

// Islamabad: each cluster/zone and the roads (locations) grouped under it.
const ISLAMABAD_CLUSTER_MAPPING: Record<string, string[]> = {
  "Red Zone": [
    "Constitution Avenue",
    "Ataturk Avenue",
    "Club Road",
    "Third Avenue",
    "Fourth Avenue",
    "Sir Syed Road",
    "Diplomatic Enclave Internal Roads",
  ],

  "Blue Area": [
    "Jinnah Avenue",
    "Fazal-ul-Haq Road",
    "Nazim-ud-Din Road",
    "Aku Road",
    "Internal Business Plazas Connecting Streets",
  ],

  "Zone 2": [
    "G.T. Road (Northwest)",
    "Jinnah Boulevard",
    "Srinagar Highway (Western Extension)",
    "Internal Society Grids (B-17, F-15, G-15 to G-17, H-13 to H-17)",
  ],

  "Zone 3": [
    "Khayaban-e-Iqbal",
    "Margalla Avenue",
    "Pir Sohawa Road",
    "Saidpur Village Road",
  ],

  "Zone 4": [
    "Park Road",
    "Murree Road (Bhara Kahu)",
    "Kuri Road",
    "Lehtrar Road",
    "Simly Dam Road",
    "Bani Gala Main Road",
  ],

  "Zone 5": [
    "Islamabad Expressway (Southern)",
    "G.T. Road (Southeastern)",
    "Soan Highway",
    "DHA Expressway & Main Boulevards",
    "Bahria Expressway & Main Boulevards",
  ],
};

async function upsertCluster(cityId: string, name: string) {
  return prisma.cluster.upsert({
    where: { cityId_name: { cityId, name } },
    update: {},
    create: { name, cityId },
  });
}

async function upsertLocation(clusterId: string, name: string) {
  await prisma.location.upsert({
    where: { clusterId_name: { clusterId, name } },
    update: {},
    create: { name, clusterId },
  });
}

async function main() {
  // 1. Cities
  for (const name of CITIES) {
    await prisma.city.upsert({ where: { name }, update: {}, create: { name } });
  }

  const cities = await prisma.city.findMany();

  // 2. Clusters + locations
  for (const city of cities) {
    if (city.name === "Islamabad") {
      for (const [clusterName, roads] of Object.entries(ISLAMABAD_CLUSTER_MAPPING)) {
        const cluster = await upsertCluster(city.id, clusterName);
        for (const road of roads) {
          await upsertLocation(cluster.id, road);
        }
        // Authoritative: drop any streets under this cluster no longer in the mapping.
        await prisma.location.deleteMany({
          where: { clusterId: cluster.id, name: { notIn: roads } },
        });
      }
      // Authoritative: drop any Islamabad clusters no longer in the mapping
      // (cascades to their locations). Safe — devices store cluster as a plain
      // string, not a foreign key, so no gateway/transformer is affected.
      await prisma.cluster.deleteMany({
        where: { cityId: city.id, name: { notIn: Object.keys(ISLAMABAD_CLUSTER_MAPPING) } },
      });
    } else {
      for (const clusterName of DEFAULT_CLUSTERS) {
        await upsertCluster(city.id, clusterName);
      }
    }
  }

  const [cityCount, clusterCount, locationCount] = await Promise.all([
    prisma.city.count(),
    prisma.cluster.count(),
    prisma.location.count(),
  ]);
  console.log(`Seeded geography: ${cityCount} cities, ${clusterCount} clusters, ${locationCount} locations.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
