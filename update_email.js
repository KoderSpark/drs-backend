const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'utils', 'emailService.js');
let content = fs.readFileSync(filePath, 'utf8');

// Update BCC logic
content = content.replace(
    'if (doctorData.nominee && doctorData.nominee.email) bccRecipients.push(doctorData.nominee.email);',
    `if (doctorData.nominees && Array.isArray(doctorData.nominees)) {
            doctorData.nominees.forEach(n => {
                if (n.email) bccRecipients.push(n.email);
            });
        }`
);

// Update Nominee Email Sending Logic
const oldNomineeLogic = `        // Send email to nominee if exists and has email
        if (doctorData.nominee && doctorData.nominee.email) {
            console.log('Nominee contact found, sending email to:', doctorData.nominee);
            const nomineeMailOptions = {
                from: \`Doctors Community <\${process.env.EMAIL_USER || 'syntaxsquadfinalyearproject@gmail.com'}>\`,
                to: doctorData.nominee.email,
                subject: isUpdate ? updateSubject : 'Doctor Registration Notification - Doctors Community',
                html: isUpdate ? updateHtml : \`
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #2D3748;">Doctor Registration Notification</h2>
                        <p style="color: #4A5568; font-size: 16px;">Dear \${doctorData.nominee.name},</p>
                        <p style="color: #4A5568; font-size: 16px;">
                            This email is to inform you that Dr. \${doctorData.name} has registered with the Doctors Community
                            and has listed you as their nominee.
                        </p>
                        <p style="color: #4A5568; font-size: 16px;">
                            As a nominee, you will be kept informed about important updates and notifications
                            related to Dr. \${doctorData.name}'s membership.
                        </p>
                        
                        <div style="margin: 30px 0; padding: 20px; background-color: #E6FFFA; border-radius: 8px;">
                            <h3 style="color: #234E52; margin-top: 0;">Important: HEALTH CARE PROFESSIONALS SELF SUPPORT SCHEME (HCPSST) Terms and Conditions</h3>
                            <p style="color: #234E52; margin: 10px 0;">
                                As a nominee, you should be aware of the following comprehensive terms and conditions:
                            </p>
                            
                            <div style="color: #234E52; margin: 15px 0;">
                                <h4 style="color: #2D3748; margin: 10px 0;">About HCPSST</h4>
                                <p style="margin: 5px 0;">HEALTH CARE PROFESSIONALS SELF SUPPORT SCHEME (HCPSST) was established for HEALTH CARE PROFESSIONALS and by HEALTH CARE PROFESSIONALS to support them. HCPSST is managed by the HEALTH CARE PROFESSIONALS TRUST.</p>
                            </div>

                            <div style="color: #234E52; margin: 15px 0;">
                                <h4 style="color: #2D3748; margin: 10px 0;">Key Rules for Nominees</h4>
                                <ol style="margin: 10px 0; padding-left: 20px;">
                                    <li style="margin: 5px 0;">The lock-in period for all types of members will be 12 months/1 year. Support will not be provided if a nominee is accused of suicide or murder, and in special circumstances, the final decision will be that of the HCPSST.</li>
                                    <li style="margin: 5px 0;">During or after the contribution, if a Doctor mistakenly sends an excess amount to the account of a nominee, the nominee will be required to return the funds to the Doctors/member's account upon presenting appropriate evidence.</li>
                                    <li style="margin: 5px 0;">Members make the contribution directly into the account of the nominee of the deceased families and hence no individual or member will have the right to raise any kind of judicial challenge.</li>
                                    <li style="margin: 5px 0;">In case of any dispute regarding the nominee, the State/Core Team will be free to take a decision after due scrutiny and provide assistance.</li>
                                    <li style="margin: 5px 0;">All information on the Telegram/WhatsApp/App is provided from time to time. Any member who does not receive information from the Telegram group will be held responsible.</li>
                                </ol>
                            </div>

                            <div style="color: #234E52; margin: 15px 0; padding: 15px; background-color: #FEF5E7; border-radius: 5px; border-left: 4px solid #F6AD55;">
                                <p style="margin: 5px 0;"><strong>Important Note:</strong> Members give their contribution directly to the nominee of the deceased Doctor, hence there will be no legal right to receive any contribution in return for the contribution given by you, it will completely depend on the wish of the members. The HCPSST will not be responsible in case the contribution is less or no more after the appeal by the team.</p>
                                <p style="margin: 5px 0;"><strong>In case of any decision, only the copy of the rules uploaded on the website will be valid.</strong></p>
                            </div>
                        </div>
                        
                        <div style="margin: 30px 0; padding: 20px; background-color: #E6FFFA; border-radius: 8px;">
                            <p style="color: #234E52; margin: 0;">
                                If you have any questions or concerns, please don't hesitate to contact us.
                            </p>
                        </div>
                        <p style="color: #4A5568; font-size: 16px;">
                            Best regards,<br>
                            The Doctors Community Team
                        </p>
                    </div>
                \`
            };
            try {
                await sendWithRetry(nomineeMailOptions);
                console.log((isUpdate ? 'Profile update' : 'Notification') + ' email sent successfully to nominee:', doctorData.nominee.email);
                results.nominee = true;
            } catch (err) {
                console.error('Failed to send email to nominee after retries:', doctorData.nominee.email, err && err.message ? err.message : err);
            }
        }`;

const newNomineeLogic = `        // Send email to all nominees
        if (doctorData.nominees && Array.isArray(doctorData.nominees)) {
            for (const nominee of doctorData.nominees) {
                if (!nominee.email) continue;
                console.log('Nominee contact found, sending email to:', nominee);
                const nomineeMailOptions = {
                    from: \`Doctors Community <\${process.env.EMAIL_USER || 'syntaxsquadfinalyearproject@gmail.com'}>\`,
                    to: nominee.email,
                    subject: isUpdate ? updateSubject : 'Doctor Registration Notification - Doctors Community',
                    html: isUpdate ? updateHtml : \`
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <h2 style="color: #2D3748;">Doctor Registration Notification</h2>
                            <p style="color: #4A5568; font-size: 16px;">Dear \${nominee.name},</p>
                            <p style="color: #4A5568; font-size: 16px;">
                                This email is to inform you that Dr. \${doctorData.name} has registered with the Doctors Community
                                and has listed you as their nominee.
                            </p>
                            <p style="color: #4A5568; font-size: 16px;">
                                As a nominee, you will be kept informed about important updates and notifications
                                related to Dr. \${doctorData.name}'s membership.
                            </p>
                            
                            <div style="margin: 30px 0; padding: 20px; background-color: #E6FFFA; border-radius: 8px;">
                                <h3 style="color: #234E52; margin-top: 0;">Important: HEALTH CARE PROFESSIONALS SELF SUPPORT SCHEME (HCPSST) Terms and Conditions</h3>
                                <p style="color: #234E52; margin: 10px 0;">
                                    As a nominee, you should be aware of the following comprehensive terms and conditions:
                                </p>
                                
                                <div style="color: #234E52; margin: 15px 0;">
                                    <h4 style="color: #2D3748; margin: 10px 0;">About HCPSST</h4>
                                    <p style="margin: 5px 0;">HEALTH CARE PROFESSIONALS SELF SUPPORT SCHEME (HCPSST) was established for HEALTH CARE PROFESSIONALS and by HEALTH CARE PROFESSIONALS to support them. HCPSST is managed by the HEALTH CARE PROFESSIONALS TRUST.</p>
                                </div>

                                <div style="color: #234E52; margin: 15px 0;">
                                    <h4 style="color: #2D3748; margin: 10px 0;">Key Rules for Nominees</h4>
                                    <ol style="margin: 10px 0; padding-left: 20px;">
                                        <li style="margin: 5px 0;">The lock-in period for all types of members will be 12 months/1 year. Support will not be provided if a nominee is accused of suicide or murder, and in special circumstances, the final decision will be that of the HCPSST.</li>
                                        <li style="margin: 5px 0;">During or after the contribution, if a Doctor mistakenly sends an excess amount to the account of a nominee, the nominee will be required to return the funds to the Doctors/member's account upon presenting appropriate evidence.</li>
                                        <li style="margin: 5px 0;">Members make the contribution directly into the account of the nominee of the deceased families and hence no individual or member will have the right to raise any kind of judicial challenge.</li>
                                        <li style="margin: 5px 0;">In case of any dispute regarding the nominee, the State/Core Team will be free to take a decision after due scrutiny and provide assistance.</li>
                                        <li style="margin: 5px 0;">All information on the Telegram/WhatsApp/App is provided from time to time. Any member who does not receive information from the Telegram group will be held responsible.</li>
                                    </ol>
                                </div>

                                <div style="color: #234E52; margin: 15px 0; padding: 15px; background-color: #FEF5E7; border-radius: 5px; border-left: 4px solid #F6AD55;">
                                    <p style="margin: 5px 0;"><strong>Important Note:</strong> Members give their contribution directly to the nominee of the deceased Doctor, hence there will be no legal right to receive any contribution in return for the contribution given by you, it will completely depend on the wish of the members. The HCPSST will not be responsible in case the contribution is less or no more after the appeal by the team.</p>
                                    <p style="margin: 5px 0;"><strong>In case of any decision, only the copy of the rules uploaded on the website will be valid.</strong></p>
                                </div>
                            </div>
                            
                            <div style="margin: 30px 0; padding: 20px; background-color: #E6FFFA; border-radius: 8px;">
                                <p style="color: #234E52; margin: 0;">
                                    If you have any questions or concerns, please don't hesitate to contact us.
                                </p>
                            </div>
                            <p style="color: #4A5568; font-size: 16px;">
                                Best regards,<br>
                                The Doctors Community Team
                            </p>
                        </div>
                    \`
                };
                try {
                    await sendWithRetry(nomineeMailOptions);
                    console.log((isUpdate ? 'Profile update' : 'Notification') + ' email sent successfully to nominee:', nominee.email);
                    results.nominees = true;
                } catch (err) {
                    console.error('Failed to send email to nominee after retries:', nominee.email, err && err.message ? err.message : err);
                }
            }
        }`;

content = content.replace(oldNomineeLogic, newNomineeLogic);
fs.writeFileSync(filePath, content);
console.log('Successfully updated emailService.js');
