import { IsString, MaxLength, MinLength } from 'class-validator';

export class AnalyzeEventDto {
  /** Free-text description of a reported event, naming at least one country. */
  @IsString()
  @MinLength(12)
  @MaxLength(2000)
  text!: string;
}
