// Seeds the geography tables: City ─> Cluster ─> Location.
// Idempotent — safe to re-run (upserts on the unique keys).
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
// The same road may appear under more than one cluster (e.g. Service Road East).
const ISLAMABAD_CLUSTER_MAPPING: Record<string, string[]> = {
  "Red Zone": ["Constitution Avenue", "Ataturk Avenue", "Embassy Road", "Club Road"],
  "Blue Area": ["Jinnah Avenue", "Faisal Avenue", "Nazimuddin Road", "Ibn-e-Sina Road", "Khayaban-e-Suhrwardy"],
  "G-10 Sector": ["Service Road East", "Service Road West", "Rohtas Road", "Kaghan Road", "Nara Road"],
  "G-11 Sector": ["Ramna Road", "College Road", "Bazaar Road", "Service Road East", "Service Road West"],
  "Main Arteries": [
    "Margalla Road", "7th Avenue", "9th Avenue", "Agha Shahi Avenue", "Khayaban-e-Iqbal",
    "Srinagar Highway", "Kashmir Highway", "Islamabad Expressway", "Park Road", "Lehtrar Road",
    "Pir Sohawa Road", "Garden Avenue", "Municipal Road",
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
      }
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
