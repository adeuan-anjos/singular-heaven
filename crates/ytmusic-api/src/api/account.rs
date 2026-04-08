use serde_json::json;

use crate::client::YtMusicClient;
use crate::error::Result;
use crate::nav::*;
use crate::types::common::AccountInfo;

impl YtMusicClient {
    /// Get the list of accounts/channels available under the current Google account.
    pub async fn get_accounts(&self) -> Result<Vec<AccountInfo>> {
        println!("[ytmusic-api] get_accounts()");
        let response = self.post_innertube("account/accounts_list", json!({})).await?;

        let mut accounts = Vec::new();

        // Navigate: actions[0].getMultiPageMenuAction.menu.multiPageMenuRenderer
        //   .sections[0].accountSectionListRenderer.contents[0].accountItemSectionRenderer.contents[]
        let sections = nav_array(&response, &["actions"]);
        let menu = sections.first()
            .and_then(|a| nav(a, &["getMultiPageMenuAction", "menu", "multiPageMenuRenderer"]));

        if let Some(menu_val) = menu {
            let menu_sections = nav_array(&menu_val, &["sections"]);
            for section in &menu_sections {
                let items = section.get("accountSectionListRenderer")
                    .and_then(|s| s.get("contents"))
                    .and_then(|c| c.as_array())
                    .cloned()
                    .unwrap_or_default();

                for item_section in &items {
                    let account_items = item_section.get("accountItemSectionRenderer")
                        .and_then(|s| s.get("contents"))
                        .and_then(|c| c.as_array())
                        .cloned()
                        .unwrap_or_default();

                    for account in &account_items {
                        if let Some(ai) = account.get("accountItem") {
                            let name = ai.get("accountName")
                                .and_then(|n| n.get("runs"))
                                .and_then(|r| r.as_array())
                                .and_then(|a| a.first())
                                .and_then(|r| r.get("text"))
                                .and_then(|t| t.as_str())
                                .unwrap_or("")
                                .to_string();

                            let photo_url = ai.get("accountPhoto")
                                .and_then(|p| p.get("thumbnails"))
                                .and_then(|t| t.as_array())
                                .and_then(|a| a.last())
                                .and_then(|t| t.get("url"))
                                .and_then(|u| u.as_str())
                                .map(|s| s.to_string());

                            let channel_handle = ai.get("channelHandle")
                                .and_then(|h| h.get("runs"))
                                .and_then(|r| r.as_array())
                                .and_then(|a| a.first())
                                .and_then(|r| r.get("text"))
                                .and_then(|t| t.as_str())
                                .map(|s| s.to_string());

                            // Extract pageId and hasChannel from selectActiveIdentityEndpoint.supportedTokens
                            let tokens = ai.get("serviceEndpoint")
                                .and_then(|s| s.get("selectActiveIdentityEndpoint"))
                                .and_then(|e| e.get("supportedTokens"))
                                .and_then(|t| t.as_array())
                                .cloned()
                                .unwrap_or_default();

                            let mut page_id = None;
                            let mut has_channel = false;

                            for token in &tokens {
                                if let Some(pid) = token.get("pageIdToken")
                                    .and_then(|p| p.get("pageId"))
                                    .and_then(|p| p.as_str()) {
                                    page_id = Some(pid.to_string());
                                }
                                if let Some(ast) = token.get("accountStateToken") {
                                    has_channel = ast.get("hasChannel")
                                        .and_then(|h| h.as_bool())
                                        .unwrap_or(false);
                                }
                            }

                            let is_active = ai.get("isSelected")
                                .and_then(|s| s.as_bool())
                                .unwrap_or(false);

                            if !name.is_empty() {
                                accounts.push(AccountInfo {
                                    name,
                                    photo_url,
                                    channel_handle,
                                    page_id,
                                    has_channel,
                                    is_active,
                                });
                            }
                        }
                    }
                }
            }
        }

        println!("[ytmusic-api] get_accounts returned {} accounts", accounts.len());
        Ok(accounts)
    }
}
