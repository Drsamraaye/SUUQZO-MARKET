import { IsEnum, IsIn } from 'class-validator';
import { UserRole } from '@prisma/client';

export class AssignUserRoleDto {
  @IsEnum(UserRole)
  role!: UserRole;

  @IsIn(['ADD', 'REMOVE'])
  action!: 'ADD' | 'REMOVE';
}
