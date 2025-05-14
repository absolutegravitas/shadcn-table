import { seedTasksToRedis } from "@/app/_lib/actions";

async function main() {
  console.log("Attempting to run seedTasksToRedis server action...");
  try {
    // You can pass a count here if you want, e.g., { count: 100 }
    const result = await seedTasksToRedis();

    if (result.error) {
      console.error("Seeding failed with error:", result.error);
      process.exit(1);
    } else {
      console.log(`Seeding successful. ${result.count} tasks processed.`);
      process.exit(0);
    }
  } catch (error) {
    console.error(
      "An unexpected error occurred while trying to run the seed script:",
      error
    );
    process.exit(1);
  }
}

main();
