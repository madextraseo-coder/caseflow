export type QualificationQuestionType = "short_text" | "long_text" | "yes_no_unknown";

export type QualificationInterviewQuestion = {
  key: string;
  question: string;
  type: QualificationQuestionType;
};

export const QUALIFICATION_INTERVIEW_TEMPLATE_CODE = "MVA_ACCIDENT_CLAIM_INTERVIEW";
export const QUALIFICATION_INTERVIEW_TEMPLATE_VERSION = "2026-08-v1";

export const QUALIFICATION_INTERVIEW_QUESTIONS: QualificationInterviewQuestion[] = [
  { key: "trip_origin_destination", question: "Where Were You Coming From and Going?", type: "long_text" },
  { key: "current_feeling", question: "How Are You Feeling?", type: "long_text" },
  { key: "policy_and_insurance_information", question: "What Is Your Policy Number and Insurance Information?", type: "long_text" },
  { key: "accident_description", question: "Can You Describe How the Accident Happened?", type: "long_text" },
  { key: "accident_exact_time_location", question: "When and Where Exactly Did the Accident Occur?", type: "long_text" },
  { key: "road_weather_conditions", question: "What Were the Road and Weather Conditions at the Time?", type: "long_text" },
  { key: "phone_use", question: "Were You Using Your Phone at the Time of the Car Crash?", type: "yes_no_unknown" },
  { key: "driving_speed", question: "How Fast Were You Driving?", type: "short_text" },
  { key: "seat_belt", question: "Were You Wearing Your Seat Belt?", type: "yes_no_unknown" },
  { key: "saw_other_vehicle", question: "Did You See the Other Vehicle Before the Collision?", type: "yes_no_unknown" },
  { key: "brakes_before_impact", question: "Did You Apply the Brakes Before Impact?", type: "yes_no_unknown" },
  { key: "fault_belief", question: "Who Do You Believe Was at Fault?", type: "long_text" },
  { key: "witnesses", question: "Were There Any Witnesses to the Car Accident?", type: "long_text" },
  { key: "police_report", question: "Was a Police Report Filed?", type: "yes_no_unknown" },
  { key: "claimed_injuries", question: "What Injuries Are You Claiming?", type: "long_text" },
  { key: "medical_treatment", question: "Have You Sought Medical Treatment for Your Injuries?", type: "long_text" },
  { key: "pre_existing_conditions", question: "Do You Have Any Pre-Existing Injuries or Medical Conditions?", type: "long_text" },
  { key: "similar_prior_treatment", question: "Have Any Doctors Treated You for Similar Injuries Before?", type: "long_text" },
  { key: "work_impact", question: "Did the Auto Accident Affect Your Ability to Work?", type: "long_text" },
  { key: "vehicle_damage_extent", question: "What Is the Extent of the Damage to Your Vehicle?", type: "long_text" },
  { key: "recorded_statement_willingness", question: "Are You Willing to Give a Recorded Statement?", type: "yes_no_unknown" }
];

export const QUALIFICATION_INTERVIEW_KEYS = new Set(QUALIFICATION_INTERVIEW_QUESTIONS.map((item) => item.key));

export function blankQualificationInterviewAnswers(): Record<string, string> {
  return Object.fromEntries(QUALIFICATION_INTERVIEW_QUESTIONS.map((item) => [item.key, ""]));
}
