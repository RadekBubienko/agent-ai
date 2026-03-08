import { saveLead } from "../saveLead"

export async function crawlGoogle(db:any) {

  const leads = [
    {
      name:"Fitness Club Warszawa",
      email:"kontakt@fitnessclub.pl",
      website:"fitnessclub.pl",
      source:"google"
    }
  ]

  for (const lead of leads) {

    await saveLead(db, lead)

  }

}