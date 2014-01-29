$(function(){
	var reg_form = $("#new-member-form");
	$(".btn-group label").each(function(){
		var self = $(this);
		var text = self.text();
		self.attr("data-text", text);
	});
	if(reg_form.length){
		var data = reg_form.data().data;
		if(data != "undefined"){
			data = JSON.parse(decodeURIComponent(data));
			reg_form.data("id", data._id);
			for(var i in data){
				$("#" + i).val(data[i]);
			}
			$("#business_type label").removeClass("active");
			$("#business_type label[data-text='"+data['business_type']+"']").addClass("active");
			
			$("#business_nature label").removeClass("active");
			$("#business_nature label[data-text='"+data['business_nature']+"']").addClass("active");
			
			$("#personal_sex label").removeClass("active");
			$("#personal_sex label[data-text='"+data['personal_sex']+"']").addClass("active");
			
			$("#membership label").removeClass("active");
			$("#membership label[data-text='"+data['membership']+"']").addClass("active");	
		}
	}
	$("form input, form textarea").each(function(){
		var self = $(this);
		self.attr("name", self.attr("id"));
		return;
		if(self.attr("type") == "email"){
			self.val(Faker.Internet.email())
		}else{
			self.val(Faker.Name.findName());
		}
	});
	$("#new-member-form").on('submit', function(e){
		e.preventDefault();
		var form = $(this);
		if(form.parsley('isValid')){
			var data = form.serializeArray();
			var obj = {};
			data.forEach(function(e){
				obj[e.name] = e.value;
			});
			obj.business_type = $("#business_type label.active").text();
			obj.business_nature = $("#business_nature label.active").text();
			obj.personal_sex = $("#personal_sex label.active").text();
			obj.membership = $("#membership label.active").text();
			var url = "/members/register";
			var update = $("#new-member-form").data().id;
			if(update){
				url = "/members/" + update;
			}
			
			$.post(url, obj, function(res){
				if(res.error){
					return alert(res.error);
				}
				if(update){
					url = "/members/" + update;
					return alert("Member update");
				}
				alert("Member added");
				$("form input").each(function(){
					$(this).val('');
				})
			})
		}
	});
	$("#new-sms-form").on('submit', function(e){
		e.preventDefault();
		var form = $(this);
		if(form.parsley('isValid')){
			var data = form.serializeArray();
			var obj = {};
			data.forEach(function(e){
				obj[e.name] = e.value;
			});
			obj.recipient_type = $("#recipient_type label.active").text();
			var url = "/sms";			
			$.post(url, obj, function(res){
				if(res.error){
					return alert(res.error);
				}
				alert("Bulk SMS queue started");
				$("form input").each(function(){
					$(this).val('');
				})
			})
		}
	});
	$("#new-user-form").on('submit', function(e){
		e.preventDefault();
		var form = $(this);
		if(form.parsley('isValid')){
			var data = form.serializeArray();
			var obj = {};
			data.forEach(function(e){
				obj[e.name] = e.value;
			});
			obj.type = $("#type label.active").text();
			var url = "/user/add";			
			$.post(url, obj, function(res){
				if(res.error){
					return alert(res.error);
				}
				alert("User added");
				$("form input").each(function(){
					$(this).val('');
				})
			})
		}
	});
	$("body").on('click', ".remove-member", function(){
		var id = $(this).attr("data-id");
		if(confirm("Are you sure you want to delete this member?")){
			$.ajax({
				url: '/members/' + id,
				type: 'DELETE',
				success: function(result) {
					window.location.reload("true");
				}
			});
		}
	});
	$("body").on('click', ".remove-user", function(){
		var id = $(this).attr("data-id");
		if(confirm("Are you sure you want to delete this user?")){
			$.ajax({
				url: '/user/' + id,
				type: 'DELETE',
				success: function(result) {
					window.location.reload("true");
				}
			});
		}
	});
});

function retrieveBalance(){
	$.getJSON('/sms/balance', function(res){
		$("#sms_balance").text(res.balance + " EURO");
	});
}



